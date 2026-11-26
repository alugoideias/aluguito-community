const {createHash} = require('node:crypto');
const {safeLink} = require('./core.cjs');
const {taskListTool} = require('./mcp.cjs');

const emailQuery = 'in:inbox newer_than:7d is:unread {is:important is:starred}';
const dateFormatter = new Intl.DateTimeFormat('pt-BR', {dateStyle: 'short'});
const timeFormatter = new Intl.DateTimeFormat('pt-BR', {timeStyle: 'short'});

function shortText(value, limit = 240) {
 return typeof value === 'string' ? value.replace(/\s+/g, ' ').trim().slice(0, limit) : '';
}

function dayKey(date) {
 return [
  String(date.getFullYear()).padStart(4, '0'),
  String(date.getMonth() + 1).padStart(2, '0'),
  String(date.getDate()).padStart(2, '0')
 ].join('-');
}

function taskDate(value) {
 const text = shortText(value, 50);
 if (!/^\d{4}-\d{2}-\d{2}(?:$|T)/.test(text)) return '';
 const date = new Date(text.length === 10 ? text + 'T12:00:00' : text);
 if (!Number.isFinite(date.getTime())) return '';
 const key = dayKey(date);
 return text.length !== 10 || text === key ? key : '';
}

function taskPayload(value, depth = 0) {
 if (depth > 5) throw new Error('Formato de tarefas não reconhecido.');
 if (typeof value === 'string') {
  const text = value.trim().replace(/^```(?:json)?\s*([\s\S]*?)\s*```$/i, '$1');
  return taskPayload(JSON.parse(text), depth + 1);
 }
 if (Array.isArray(value)) {
  if (value.length && value.every(entry => entry?.type === 'text' && typeof entry.text === 'string')) {
   const replies = value.map(entry => taskPayload(entry.text, depth + 1));
   return {items: replies.flatMap(reply => reply.items), partial: replies.some(reply => reply.partial)};
  }
  return {items: value, partial: false};
 }
 if (value && typeof value === 'object') {
  for (const key of ['tasks', 'tarefas', 'items', 'results', 'data', 'result']) {
   if (!Object.hasOwn(value, key)) continue;
   const reply = taskPayload(value[key], depth + 1);
   return {items: reply.items, partial: reply.partial || Boolean(value.hasMore || value.has_more ||
    value.nextCursor || value.next_cursor || Number(value.total) > reply.items.length)};
  }
 }
 throw new Error('Formato de tarefas não reconhecido.');
}

function projectTasks(response, profile, today) {
 const {items, partial} = taskPayload(response);
 let skipped = 0;
 const tasks = [];
 for (const item of items) {
  const title = shortText(item?.title ?? item?.titulo ?? item?.name ?? item?.nome ?? item?.summary ??
   (typeof item === 'string' ? item : ''));
  if (!title) { skipped++; continue; }
  const status = shortText(item?.status?.name ?? item?.status?.nome ?? item?.status ?? item?.situacao, 60);
  const normalized = status.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
  if (item?.completed === true || item?.concluida === true || /^(?:done|closed|completed|complete|cancelled|canceled|archived|finalizad[ao]|concluid[ao]|cancelad[ao]|arquivad[ao]|encerrad[ao])$/.test(normalized)) continue;
  const due = taskDate(item?.dueDate ?? item?.due_date ?? item?.due_at ?? item?.data_vencimento ??
   item?.vencimento ?? item?.dataVencimento ?? item?.prazo ?? item?.deadline);
  const when = !due ? 'Sem prazo' : due < today ? 'Atrasada' : due === today ? 'Vence hoje' : 'Prazo futuro';
  const identity = item?.id ?? item?.task_id ?? item?.tarefa_id;
  const key = createHash('sha256').update(JSON.stringify([profile.id, identity ?? [title, due]])).digest('hex');
  tasks.push({title, status, due, when, key, project: profile.name, url: safeLink(item?.url ?? item?.link ?? item?.webUrl)});
 }
 if (items.length && skipped === items.length) throw new Error('Formato de tarefas não reconhecido.');
 return {tasks, partial: partial || skipped > 0};
}

async function source(connected, load) {
 if (!connected) return {status: 'disconnected', items: []};
 try {
  return {status: 'ok', items: await load()};
 } catch {
  return {status: 'error', items: []};
 }
}

async function loadTaskProjects(mcp, data, now = new Date()) {
 const today = dayKey(now);
 const profiles = (data.mcpProfiles || []).filter(profile => taskListTool(profile));
 return Promise.all(profiles.map(async profile => {
  const project = {id: profile.id, name: profile.name};
  try {
   const result = await mcp.connection(profile.id).listDailyTasks();
   return {...project, status: 'ok', ...projectTasks(result, profile, today)};
  } catch {
   return {...project, status: 'error', tasks: [], partial: false};
  }
 }));
}

function trackWorkDeadlines(previous, projects, profileIds, daysAhead, now = new Date()) {
 const today = dayKey(now);
 const limit = new Date(now);
 limit.setDate(limit.getDate() + Math.max(0, daysAhead));
 const through = dayKey(limit);
 const tracked = Object.fromEntries(Object.entries(previous || {}).filter(([, task]) => profileIds.has(task.projectId)));
 const due = [];
 for (const project of projects) {
  if (project.status !== 'ok' || !profileIds.has(project.id)) continue;
  const old = new Map(Object.entries(tracked).filter(([, row]) => row.projectId === project.id));
  if (!project.partial) for (const key of old.keys()) delete tracked[key];
  for (const task of project.tasks) {
   if (!task.due) { delete tracked[task.key]; continue; }
   const prior = old.get(task.key);
   const sent = prior?.due === task.due && prior.sent === true || tracked[task.key]?.due === task.due && tracked[task.key]?.sent === true;
   const alert = !sent && daysAhead >= 0 && today <= task.due && task.due <= through;
   tracked[task.key] = {due: task.due, projectId: project.id, sent: sent || alert};
   if (alert) due.push({...task, today: task.due === today});
  }
 }
 return {tracked, due};
}

async function dailyOverview({google, mcp, data, now = new Date(), taskProjects}) {
 const start = new Date(now);
 start.setHours(0, 0, 0, 0);
 const end = new Date(start);
 end.setDate(end.getDate() + 1);
 const googleConnected = Boolean(data.googleTokens);
 const googleGeneration = google.generation;
 // Refresh the shared token before parallel Google requests.
 const googleReady = googleConnected ? Promise.resolve().then(() => google.access()) : null;
 const readGoogle = load => async () => {
  await googleReady;
  const items = await load();
  if (google.generation !== googleGeneration) throw new Error('A conta Google mudou.');
  return items;
 };
 const [agenda, emails, projects] = await Promise.all([
  source(googleConnected, readGoogle(async () => (await google.events({start, end}))
   .filter(event => event.status !== 'cancelled' && event.start &&
    (event.allDay || Number.isFinite(Date.parse(event.start))))
   .map(event => ({title: shortText(event.title) || 'Sem título', time: event.allDay ? 'Dia todo' :
    timeFormatter.format(new Date(event.start)), url: safeLink(event.link || event.calendarLink)})))),
  source(googleConnected, readGoogle(async () => (await google.emails(emailQuery))
   .map(email => ({title: shortText(email.subject) || 'Sem assunto', from: shortText(email.from), url: safeLink(email.link)})))),
  taskProjects ?? loadTaskProjects(mcp, data, now)
 ]);
 const tasks = projects.flatMap(project => project.tasks).sort((a, b) =>
  (a.due || '9999').localeCompare(b.due || '9999') || a.title.localeCompare(b.title, 'pt-BR'));
 return {
  date: dateFormatter.format(start), agenda, emails, tasks,
  projects: projects.map(({name, status, partial}) => ({name, status, partial}))
 };
}

module.exports = {dailyOverview, loadTaskProjects, trackWorkDeadlines};
