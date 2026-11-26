const {randomUUID} = require('node:crypto');

const weekdays = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sab'];
const normalize = text => text.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
const reminderIntent = /^(?:(?:por favor[, ]+)?(?:me lembr(?:e|a)|lembre-me|me avis(?:e|a)|avise-me)|daqui a .+?\b(?:me lembr(?:e|a)|lembre-me|me avis(?:e|a)|avise-me)|(?:crie|cadastre|adicione) (?:um )?lembrete(?: pessoal)?)(?=\s|$)/iu;
const weekdayPattern = '(?:domingos?|(?:segunda|terca|quarta|quinta|sexta)s?(?:-feiras?)?|sabados?)';

function nextOccurrence(days, time, after) {
 const [hours, minutes] = time.split(':').map(Number);
 for (let offset = 0; offset <= 7; offset++) {
  const date = new Date(after);
  date.setDate(date.getDate() + offset);
  date.setHours(hours, minutes, 0, 0);
  if (days.includes(date.getDay()) && date.getTime() > after) return date.getTime();
 }
 throw new Error('Escolha ao menos um dia da semana.');
}

function reminderSpec(input, now = Date.now()) {
 const title = typeof input?.title === 'string' ? input.title.trim() : '';
 if (!title || title.length > 160) throw new Error('Use um nome de até 160 caracteres.');
 if (!Array.isArray(input.days) || input.days.some(day => !Number.isInteger(day) || day < 0 || day > 6)) {
  throw new Error('Escolha os dias da semana.');
 }
 const days = [...new Set(input.days)].sort();
 const time = input.time;
 if (days.length) {
  if (typeof time !== 'string' || !/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) throw new Error('Informe um horário válido.');
  return {title, days, time, due: nextOccurrence(days, time, now)};
 }
 if (!Number.isSafeInteger(input.due) || input.due <= now || input.due > now + 3660 * 86400000) {
  throw new Error('Escolha uma data e um horário futuros.');
 }
 return {title, days, time: '', due: input.due};
}

function parseReminder(text, now = Date.now()) {
 if (typeof text !== 'string' || !reminderIntent.test(text.trim())) return null;
 const original = text.trim().normalize('NFC').replace(/[.!?]+$/, '');
 const plain = normalize(original);
 const times = [...plain.matchAll(/\b(?:as|pelas?)\s+(\d{1,2})(?:h(\d{2})?|:(\d{2})|\s+horas?)?\b/g)];
 const prefix = plain.match(reminderIntent);
 const delay = plain.match(/\b(?:daqui (?:a )?|em )(\d{1,5})\s*(min(?:utos?|s|t)?|h(?:oras?)?|dias?)\b/);
 const date = plain.match(/\b(\d{1,2})\/(\d{1,2})(?:\/(\d{4}))?\b/);
 const relative = plain.match(/\b(hoje|amanha|depois de amanha)\b/);
 const weekly = [...plain.matchAll(new RegExp('(?:\\b(?:nas?|nos?|as|aos?|todas as|todos os|toda|todo|de)\\s+)' +
  weekdayPattern + '(?:(?:\\s*,\\s*|\\s+e\\s+|\\s+a\\s+)' + weekdayPattern + ')*', 'g'))];
 const daily = plain.match(/\b(?:todos os dias|todo dia|diariamente|dias uteis|de segunda(?:-feira)? a sexta(?:-feira)?)\b/);
 const dayNumbers = daily ? (/uteis|segunda/.test(daily[0]) ? [1, 2, 3, 4, 5] : [0, 1, 2, 3, 4, 5, 6]) :
  weekly.flatMap(([part]) => [...part.matchAll(new RegExp(weekdayPattern, 'g'))]
   .map(match => weekdays.indexOf(match[0].slice(0, 3))));
 const spans = [prefix, delay, date, relative, daily, ...times].filter(Boolean)
  .map(match => [match.index, match.index + match[0].length]);
 for (const match of weekly) spans.push([match.index, match.index + match[0].length]);
 const title = original.split('').map((character, index) =>
  spans.some(([start, end]) => index >= start && index < end) ? ' ' : character).join('')
  .replace(/^\s*(?:de|para)\s+/i, '').replace(/\s+(?:no dia|e)\s*$/i, '')
  .replace(/\s{2,}/g, ' ').replace(/^[\s,:-]+|[\s,:-]+$/g, '').trim();
 const timeMatch = times[0];
 const hours = Number(timeMatch?.[1]), minutes = Number(timeMatch?.[2] || timeMatch?.[3] || 0);
 const time = hours < 24 && minutes < 60 ? String(hours).padStart(2, '0') + ':' + String(minutes).padStart(2, '0') : '';
 const singleDay = !daily && weekly.length === 1 && dayNumbers.length === 1 &&
  /^(?:na|no) /.test(weekly[0][0]) ? dayNumbers[0] : null;
 const days = singleDay === null ? [...new Set(dayNumbers)].sort() : [];
 const spec = {title: title.slice(0, 160), days, time, due: null};
 if (times.length > 1 || /\bas \d{1,2}(?:h\d*|:\d{2})?\s+e\s+\d/i.test(plain)) {
  return {...spec, time: '', warning: 'Cadastre um lembrete para cada horário.'};
 }
 if (delay && !days.length) {
  const unit = delay[2][0];
  const value = Number(delay[1]);
  if (unit === 'd') {
   const future = new Date(now);
   future.setDate(future.getDate() + value);
   spec.due = future.getTime();
  } else spec.due = now + value * (unit === 'h' ? 3600000 : 60000);
 } else if (time && singleDay !== null) {
  spec.due = nextOccurrence([singleDay], time, now);
 } else if (time && !days.length) {
  const target = new Date(now);
  if (date) {
   target.setFullYear(date[3] ? Number(date[3]) : target.getFullYear(), Number(date[2]) - 1, Number(date[1]));
   if (target.getMonth() !== Number(date[2]) - 1 || target.getDate() !== Number(date[1])) return spec;
  } else if (relative && relative[0] !== 'hoje') target.setDate(target.getDate() + (relative[0] === 'amanha' ? 1 : 2));
  target.setHours(hours, minutes, 0, 0);
  if (!date && !relative && target.getTime() <= now) target.setDate(target.getDate() + 1);
  spec.due = target.getTime();
 }
 return spec;
}

class PersonalReminders {
 constructor({read, save}) {
  this.read = read;
  this.save = save;
  this.queue = Promise.resolve();
 }
 list() {
  return this.read().personalReminders || [];
 }
 update(change) {
  const run = this.queue.catch(() => {}).then(async () => {
   const items = this.list();
   const [next, result] = change(items);
   if (next !== items) await this.save({personalReminders: next});
   return result;
  });
  this.queue = run;
  return run;
 }
 create(input, now) {
  const item = {id: randomUUID(), ...reminderSpec(input, now)};
  return this.update(items => {
   if (items.length >= 200) throw new Error('Limite de 200 lembretes. Remova um lembrete para continuar.');
   return [[...items, item], item];
  });
 }
 act(id, action, now = Date.now()) {
  return this.update(items => {
   const item = items.find(reminder => reminder.id === id);
   if (!item) return [items];
   if (action === 'remove' || (action === 'done' && !item.days.length)) return [items.filter(row => row !== item)];
   if (action === 'snooze' && item.notified) {
    return [items.map(row => row === item ? {...item, notified: false, snooze: now + 600000} : row)];
   }
   if (action === 'done' && item.notified) {
    return [items.map(row => row === item ? {...item, notified: false, snooze: null} : row)];
   }
   return [items];
  });
 }
 takeDue(now = Date.now()) {
  return this.update(items => {
   const due = [];
   const next = items.map(item => {
    const scheduled = item.due && item.due <= now;
    const snoozed = item.snooze && item.snooze <= now;
    if (!scheduled && !snoozed) return item;
    due.push(item);
    return {...item, notified: true, snooze: null,
     due: scheduled ? (item.days.length ? nextOccurrence(item.days, item.time, now) : null) : item.due};
   });
   return [due.length ? next : items, due];
  });
 }
}

module.exports = {parseReminder, PersonalReminders};
