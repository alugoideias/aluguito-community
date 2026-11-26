const http = require('node:http');
const crypto = require('node:crypto');
const { pkce, eventView } = require('./core.cjs');
class Google {
  constructor({ read, save, open }) { this.read = read; this.save = save; this.open = open; this.pending = false; this.generation = 0; }
  async connect() {
    if (this.pending) throw new Error('Já existe uma conexão em andamento. Conclua no navegador ou aguarde dois minutos.');
    const credentials = this.read().googleClient;
    if (!credentials?.client_id) throw new Error('Importe primeiro o arquivo de configuração Google em Ajustes.');
    this.pending = true; const generation = this.generation; const { verifier, challenge, state } = pkce();
    let server, timer;
    try {
      const code = await new Promise((resolve, reject) => {
        server = http.createServer((req, res) => {
          const u = new URL(req.url, 'http://127.0.0.1');
          if (u.pathname !== '/callback') { res.writeHead(404); return res.end(); }
          const received = u.searchParams.get('state') || '';
          const receivedBytes = Buffer.from(received), expectedBytes = Buffer.from(state);
          if (receivedBytes.length !== expectedBytes.length || !crypto.timingSafeEqual(receivedBytes, expectedBytes)) { res.writeHead(400); return res.end('Solicitacao invalida.'); }
          res.setHeader('Content-Type', 'text/plain; charset=utf-8');
          res.end('Autorização recebida. Você pode voltar ao Aluguito.');
          if (u.searchParams.has('error')) return reject(new Error('Conexão cancelada no Google.'));
          if (!u.searchParams.get('code')) return reject(new Error('O Google não enviou o código de autorização.'));
          resolve({ code: u.searchParams.get('code'), redirect: `http://127.0.0.1:${server.address().port}/callback` });
        });
        server.on('error', reject);
        server.listen(0, '127.0.0.1', () => {
          const redirect = `http://127.0.0.1:${server.address().port}/callback`;
          const query = new URLSearchParams({ client_id: credentials.client_id, redirect_uri: redirect, response_type: 'code', scope: 'https://www.googleapis.com/auth/gmail.readonly https://www.googleapis.com/auth/calendar.events.readonly', access_type: 'offline', prompt: 'consent', state, code_challenge: challenge, code_challenge_method: 'S256' });
          this.open(`https://accounts.google.com/o/oauth2/v2/auth?${query}`).catch(reject);
        });
        timer = setTimeout(() => reject(new Error('O tempo para conectar terminou. Tente novamente.')), 120000);
      });
      const tokens = await this.token({ client_id: credentials.client_id, client_secret: credentials.client_secret || '', code: code.code, code_verifier: verifier, redirect_uri: code.redirect, grant_type: 'authorization_code' });
      if (generation !== this.generation) throw new Error('Conexão cancelada.');
      await this.save({ googleTokens: tokens });
      try { const profile=await this.request('gmail/v1/users/me/profile'); if(generation===this.generation)await this.save({googleEmail:profile.emailAddress||''}); } catch { /* The profile label is optional; API-specific errors are shown on consultation. */ }
    } finally { clearTimeout(timer); server?.close(); this.pending = false; }
  }
  async token(data) {
    const response = await fetch('https://oauth2.googleapis.com/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams(data), signal: AbortSignal.timeout(20000) });
    if (!response.ok) throw new Error('Não foi possível autorizar a conta Google. Reconecte a conta e confira a configuração do projeto.');
    const body = await response.json(); return { ...body, expires_at: Date.now() + (body.expires_in || 3600) * 1000 };
  }
  async access() {
    const data = this.read(); let tokens = data.googleTokens;
    if (!tokens) throw new Error('Conecte sua conta Google em Ajustes.');
    if (Date.now() >= tokens.expires_at - 60000) {
      if (!tokens.refresh_token) throw new Error('Sua autorização expirou. Reconecte a conta Google.');
      const generation = this.generation;
      tokens = { ...tokens, ...await this.token({ grant_type: 'refresh_token', refresh_token: tokens.refresh_token, client_id: data.googleClient.client_id, client_secret: data.googleClient.client_secret || '' }) };
      if (generation !== this.generation) throw new Error('Conta desconectada.');
      await this.save({ googleTokens: tokens });
    }
    return tokens.access_token;
  }
  async request(path) {
    const token = await this.access();
    const response = await fetch(`https://www.googleapis.com/${path}`, { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(25000) });
    if (!response.ok) throw new Error(response.status === 403 ? 'Acesso não autorizado. Ative Gmail API e Google Calendar API no projeto e confira as permissões da conta.' : 'Não foi possível consultar o Google. Confira a conexão ou reconecte a conta.');
    return response.json();
  }
  async events({includePastToday = false, start, end} = {}) {
    const now = new Date();
    const rangeStart = start || new Date(now);
    if (!start && includePastToday) rangeStart.setHours(0, 0, 0, 0);
    const rangeEnd = end || new Date(now.getTime() + 7 * 86400000);
    const params = new URLSearchParams({ timeMin: rangeStart.toISOString(), timeMax: rangeEnd.toISOString(), singleEvents: 'true', orderBy: 'startTime', maxResults: '100' });
    const data = await this.request(`calendar/v3/calendars/primary/events?${params}`);
    return (data.items || []).map(eventView);
  }
  async emails(query = 'in:inbox') {
    const data = await this.request(`gmail/v1/users/me/messages?${new URLSearchParams({ q: query.slice(0, 500) || 'in:inbox', maxResults: '15' })}`);
    return Promise.all((data.messages || []).map(async ({ id }) => {
      const message = await this.request(`gmail/v1/users/me/messages/${encodeURIComponent(id)}?format=metadata&metadataHeaders=Subject&metadataHeaders=From&metadataHeaders=Date`);
      const header = name => message.payload?.headers?.find(h => h.name.toLowerCase() === name.toLowerCase())?.value || '';
      return { id, subject: header('Subject') || 'Sem assunto', from: header('From'), date: header('Date'), snippet: message.snippet || '', link: `https://mail.google.com/mail/u/?${new URLSearchParams({authuser:this.read().googleEmail||'0'})}#all/${id}` };
    }));
  }
  async disconnect() {
    this.generation++; const token = this.read().googleTokens?.refresh_token || this.read().googleTokens?.access_token;
    await this.save({ googleTokens: null, googleEmail: '' });
    if (token) { try { await fetch('https://oauth2.googleapis.com/revoke', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ token }), signal: AbortSignal.timeout(10000) }); } catch { /* Local credentials were removed; revoke can also be done in Google Account. */ } }
  }
}
module.exports = { Google };
