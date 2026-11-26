const {randomUUID}=require('node:crypto');
function createConversation(){const now=new Date().toISOString();return{id:randomUUID(),title:'Nova conversa',createdAt:now,updatedAt:now,messages:[]};}
function migrateConversations(data){
 if(Array.isArray(data.conversations)&&data.conversations.length){return{conversations:data.conversations,activeConversationId:data.conversations.some(c=>c.id===data.activeConversationId)?data.activeConversationId:data.conversations[0].id};}
 const conversation=createConversation();
 if(Array.isArray(data.history)&&data.history.length){conversation.title='Conversa anterior';let privateTurn=false;conversation.messages=data.history.map(m=>{if(m.role==='user')privateTurn=Boolean(m.private||m.text?.includes('<email>'));return{...m,private:privateTurn};});}
 return{conversations:[conversation],activeConversationId:conversation.id};
}
function listConversations(data){return data.conversations.map(({id,title,updatedAt,messages})=>({id,title,updatedAt,count:messages.length})).sort((a,b)=>b.updatedAt.localeCompare(a.updatedAt));}
function getConversation(data,id=data.activeConversationId){const c=data.conversations.find(c=>c.id===id);if(!c)throw new Error('Conversa não encontrada.');return c;}
function titleFromText(text){return text.replace(/[#*_`\n\r]/g,' ').replace(/\s+/g,' ').trim().slice(0,65)||'Nova conversa';}
module.exports={createConversation,migrateConversations,listConversations,getConversation,titleFromText};
