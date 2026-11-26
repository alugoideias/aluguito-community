const builtins=[{id:'default',name:'Padrão (pixel)',file:'aluguito.png',format:'original',coffeeRow:0},{id:'cartoon',name:'Padrão (sem pixel)',file:'aluguito-cartoon-frente.png',format:'atlas24',softPalette:true,coffeeRow:1},{id:'aventureiro',name:'Aventureiro',file:'aluguito-aventureiro-frente.png',format:'atlas24',softPalette:true,coffeeRow:2},{id:'natal',name:'Natal',file:'aluguito-natal-frente.png',format:'atlas24',softPalette:true,coffeeRow:3},{id:'cientista',name:'Cientista',file:'aluguito-cartoon-frente.png',format:'atlas24',coffeeRow:1}];
function skinList(data){return[...builtins,...(data.skins||[])].map(({id,name})=>({id,name}));}
function imageFormat({width,height}){if(width===1536&&[1872,2288].includes(height))return'original';if(width===1536&&height===1024)return'atlas24';return'static';}
const coffeeDuration = 7200;
module.exports={builtins,skinList,imageFormat,coffeeDuration};
