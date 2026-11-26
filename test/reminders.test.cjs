const {test} = require('node:test');
const assert = require('node:assert/strict');
const {parseReminder,PersonalReminders} = require('../src/personal-reminders.cjs');
const {trackWorkDeadlines} = require('../src/daily-overview.cjs');

test('personal chat extracts intervals, dates and weekday routines without selecting MCP tools', () => {
 const now = +new Date(2026,10,26,13,53,28);
 assert.deepEqual(parseReminder('Daqui a 5 minutos, me lembra de recolher a roupa',now), {
  title:'recolher a roupa',days:[],time:'',due:now+300000
 });
 assert.deepEqual(parseReminder('Me lembra de ir à academia às 18h nas segundas, quartas e sextas',now), {
  title:'ir à academia',days:[1,3,5],time:'18:00',due:null
 });
 const next = parseReminder('Me avisa de ir na segunda às 18h',now);
 assert.deepEqual(next.days, []);
 assert.equal(next.due, +new Date(2026,10,30,18));
 assert.equal(parseReminder('Me lembra de responder amanhã às 14h',now).due,+new Date(2026,10,27,14));
 assert.equal(parseReminder('Crie uma tarefa no MCP',now),null);
 assert.match(parseReminder('Me lembra de bater o ponto às 8h e às 18h',now).warning,/cada horário/);
});

test('personal reminders survive reload, alert once, snooze and keep future occurrences', async () => {
 let data = {};
 const storage = {read:()=>data,save:async patch=>{data={...data,...structuredClone(patch)};}};
 let reminders = new PersonalReminders(storage);
 const start = +new Date(2026,10,26,7,59);
 const single = await reminders.create({title:'Roupa',days:[],due:start+1000},start);
 const recurring = await reminders.create({title:'Bater o ponto',days:[4,5],time:'08:00'},start);
 reminders = new PersonalReminders(storage);
 assert.deepEqual((await reminders.takeDue(start+60000)).map(item=>item.id),[single.id,recurring.id]);
 assert.deepEqual(await reminders.takeDue(start+61000),[]);
 await reminders.act(single.id,'snooze',start+60000);
 await reminders.act(recurring.id,'done',start+60000);
 assert.equal(reminders.list().find(item=>item.id===recurring.id).due,+new Date(2026,10,27,8));
 assert.deepEqual((await reminders.takeDue(start+660000)).map(item=>item.id),[single.id]);
 await reminders.act(single.id,'done',start+660000);
 assert.deepEqual(reminders.list().map(item=>item.id),[recurring.id]);
});

test('work scans notify only current authorized deadlines, suppress repeats, and accept a changed date', () => {
 const now = new Date(2026,10,26,10);
 const ids = new Set(['work']);
 const project = (due, status='ok', partial=false) => ({
  id:'work',status,partial,tasks:due?[{due,key:'task',title:'Entrega',project:'Estúdio'}]:[]
 });
 const first = trackWorkDeadlines({},[project('2026-11-27')],ids,1,now);
 assert.equal(first.due.length,1);
 assert.equal(first.tracked.task.due,'2026-11-27');
 assert.equal(trackWorkDeadlines(first.tracked,[project('2026-11-27')],ids,1,now).due.length,0);
 assert.equal(trackWorkDeadlines(first.tracked,[project('2026-11-26','error')],ids,1,now).due.length,0);
 assert.equal(trackWorkDeadlines(first.tracked,[project('2026-11-26')],ids,1,now).due[0].today,true);
 assert.deepEqual(trackWorkDeadlines(first.tracked,[project(null)],ids,1,now).tracked,{});
 assert.deepEqual(trackWorkDeadlines(first.tracked,[project('2026-11-26')],new Set(),1,now),{tracked:{},due:[]});
});
