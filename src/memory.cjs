const MAX_MEMORY=30000;
function preferredName(value = '') {
 if (typeof value !== 'string' || value.length > 80 || /[\p{Cc}\p{Cf}]/u.test(value)) {
  throw new Error('Digite um nome de até 80 caracteres.');
 }
 return value.trim().replace(/\s+/gu, ' ');
}
function memoryValue(input) {
 if (typeof input?.text !== 'string' || input.text.length > MAX_MEMORY || input.text.includes('\u0000')) {
  throw new Error('Use um Markdown de até 30 mil caracteres, sem caracteres inválidos.');
 }
 return {
  text: input.text, enabled: Boolean(input.enabled),
  name: String(input.name || 'Minha memória.md').slice(0, 120),
  preferredName: preferredName(input.preferredName),
  updatedAt: new Date().toISOString()
 };
}
function memoryContext(value){return value?.enabled&&value.text?String(value.text).slice(0,MAX_MEMORY):'';}
module.exports={MAX_MEMORY,memoryValue,memoryContext,preferredName};
