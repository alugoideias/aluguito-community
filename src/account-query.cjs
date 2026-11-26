const emailWords = /\b(?:e-?mails?|gmail|caixa de entrada|minhas mensagens)\b/;
const agendaWords = /\b(?:agenda|compromissos?|reunioes?|reuniao|eventos?)\b/;
const lookup = /\b(?:nada|algum(?:a|as|s)?|quais|qual|quantos?|quantas?|tem|tenho|tinha|cheg\w+|receb\w+|procure|busque|encontre|olhe|verif\w+|consulte|confira|veja|liste|mostre|resum\w+)\b/;
const dateFilter = /\b(?:semana passada|semana que vem|pr[oó]xima semana|esta semana|essa semana|nesta semana|desta semana|hoje|amanh[ãa]|ontem)(?![\p{L}\p{N}_])/iu;

function accountIntent(text) {
 const question = String(text).trim().normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
 // Requests to draft or explain something should not read from a private account.
 if (/^(?:por favor[, ]+)?(?:escrev\w+|redig\w+|envie|mande|crie|marque|agende|cancele|explique|o que (?:e|significa)|como (?:funciona|usar))\b/.test(question)) return null;
 if (emailWords.test(question) && (lookup.test(question) || /\b(?:meus?|minha)\b/.test(question))) return 'emails';
 if (agendaWords.test(question) && (lookup.test(question) || /\b(?:meus?|minhas?)\b/.test(question))) return 'agenda';
 if (/^o que (?:eu )?tenho (?:para )?(?:hoje|amanha)\b/.test(question)) return 'agenda';
 return null;
}

function periodFor(text, now) {
 const phrase = text.match(dateFilter)?.[0].toLowerCase();
 if (!phrase) return null;
 const start = new Date(now);
 start.setHours(0, 0, 0, 0);
 let days = 1, label = phrase;
 if (/semana/.test(phrase)) {
  start.setDate(start.getDate() - (start.getDay() + 6) % 7);
  if (phrase === 'semana passada') start.setDate(start.getDate() - 7);
  else if (/vem|xima/.test(phrase)) start.setDate(start.getDate() + 7);
  else label = 'esta semana';
  days = 7;
 } else if (phrase === 'ontem') start.setDate(start.getDate() - 1);
 else if (phrase.normalize('NFD').replace(/[\u0300-\u036f]/g, '') === 'amanha') start.setDate(start.getDate() + 1);
 const end = new Date(start);
 end.setDate(end.getDate() + days);
 return {start, end, label};
}

function emailSearch(text, period) {
 const withoutDate = text.replace(dateFilter, '');
 const term = withoutDate.match(/\b(?:com (?:o )?assunto|sobre|da parte (?:de|da|do)|de|da|do|das|dos)\s+(.+?)(?=\s+(?:n[oa]s?\s+(?:e-?mails?|gmail|caixa de entrada)|na minha caixa de entrada)\b|[?;\r\n]|$)/iu)?.[1]
  ?.replace(/^(?:e-?mails?|gmail|entrada)\s*$/iu, '').replace(/["{}\\]/g, '').trim().slice(0, 100);
 const filters = ['in:inbox'];
 if (term) filters.push('{from:"' + term + '" "' + term + '"}');
 if (period) filters.push('after:' + Math.floor(period.start.getTime() / 1000), 'before:' + Math.floor(period.end.getTime() / 1000));
 return {query: filters.join(' '), term};
}

function markdownText(value) {
 return String(value).replace(/\s+/g, ' ').trim().replace(/[\\`*_~[\]<>!]/g, '\\$&');
}

async function lookupAccount(google, intent, text, now = new Date()) {
 const period = periodFor(text, now);
 const when = period ? ' — ' + period.label : '';
 if (intent === 'agenda') {
  const data = await google.events(period ? {start: period.start, end: period.end} : {includePastToday: true});
  const events = data.filter(event => event.status !== 'cancelled' && event.start);
  if (!events.length) return {text: 'Não encontrei compromissos na sua agenda principal' + (period ? when : ' nos próximos sete dias') + '.'};
  const titles = events.slice(0, 15).map(event => {
   const day = event.allDay ? new Date(event.start + 'T12:00:00') : new Date(event.start);
   const date = new Intl.DateTimeFormat('pt-BR', {dateStyle: 'short', ...(!event.allDay && {timeStyle: 'short'})}).format(day);
   return '- **' + date + (event.allDay ? ' · dia todo' : '') + '** — ' + markdownText(event.title);
  });
  const sources = events.slice(0, 15).flatMap(event =>
   event.link || event.calendarLink ? [{title: event.title, url: event.link || event.calendarLink}] : []);
  return {text: '**Agenda principal' + when + '**\n\n' + titles.join('\n') +
   (events.length > 15 ? '\n\nExibindo os 15 primeiros compromissos.' : ''), sources};
 }
 const {query, term} = emailSearch(text, period);
 const emails = await google.emails(query);
 const topic = term ? ' para **' + markdownText(term) + '**' : '';
 if (!emails.length) return {text: 'Não encontrei e-mails na sua caixa de entrada' + topic + when + '.'};
 const titles = emails.map((email, index) => {
  const header = '- **' + markdownText(email.subject) + '**' + (email.from ? ' — ' + markdownText(email.from) : '');
  const preview = term && index < 5 && email.snippet ? '\n  ' + markdownText(email.snippet.slice(0, 220)) : '';
  return header + preview;
 });
 return {text: '**Caixa de entrada' + when + '**' + topic + '\n\n' + titles.join('\n') +
  (emails.length === 15 ? '\n\nExibindo até 15 mensagens.' : ''),
  sources: emails.filter(email => email.link).map(email => ({title: email.subject, url: email.link}))};
}

module.exports = {accountIntent, lookupAccount};
