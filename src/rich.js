(() => {
  const escape = value => String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  function webUrl(value){try{const u=new URL(value);const h=u.hostname.toLowerCase();if(u.protocol!=='https:'||u.username||u.password||h==='localhost'||h.endsWith('.local')||/^\[|^(127|10|0|169\.254|192\.168)\./.test(h)||/^172\.(1[6-9]|2\d|3[01])\./.test(h))return null;return u.href;}catch{return null;}}
  marked.use({renderer:{image({href,text}){return `<a href="${escape(href)}">${escape(text||'Ver imagem')}</a>`;}}});
  function markdown(text){
    const div=document.createElement('div');div.className='markdown';
    div.innerHTML=DOMPurify.sanitize(marked.parse(String(text),{gfm:true,breaks:false}),{ALLOWED_TAGS:['p','br','strong','em','del','h1','h2','h3','h4','ul','ol','li','blockquote','pre','code','a','table','thead','tbody','tr','th','td','hr','span'],ALLOWED_ATTR:['href','title','start'],ALLOW_DATA_ATTR:false});
    for(const a of div.querySelectorAll('a')){const href=webUrl(a.getAttribute('href'));if(!href){a.replaceWith(document.createTextNode(a.textContent));continue;}a.href=href;a.addEventListener('click',e=>{e.preventDefault();window.aluguito.call('open-link',href).catch(()=>{});});}
    for(const table of div.querySelectorAll('table')){const wrapper=document.createElement('div');wrapper.className='table-wrap';table.replaceWith(wrapper);wrapper.append(table);}
    return div;
  }
  function images(items=[]){const grid=document.createElement('div');grid.className='image-results';for(const item of items){const url=webUrl(item.url),source=webUrl(item.source);if(!url||!source)continue;const figure=document.createElement('figure'),img=document.createElement('img'),caption=document.createElement('figcaption'),link=document.createElement('a');img.src=url;img.alt=item.title||'Imagem da pesquisa';img.loading='lazy';img.referrerPolicy='no-referrer';img.addEventListener('error',()=>{const fallback=document.createElement('p');fallback.textContent='Imagem indisponível. Abra a fonte para visualizar.';img.replaceWith(fallback);},{once:true});link.textContent=item.title||new URL(source).hostname;link.href=source;link.onclick=e=>{e.preventDefault();window.aluguito.call('open-link',source).catch(()=>{});};caption.append(link);figure.append(img,caption);grid.append(figure);}return grid;}
  function extras(result,container){
    if(result.mcpTools?.length){const p=document.createElement('p');p.className='hint';p.textContent='Ferramentas do projeto usadas: '+result.mcpTools.join(', ');container.append(p);}
    if(result.images?.length)container.append(images(result.images));
    if(result.imageNotice){const p=document.createElement('p');p.className='hint';p.textContent=result.imageNotice;container.append(p);}
    if(result.sources?.length){const details=document.createElement('details'),summary=document.createElement('summary'),list=document.createElement('ul');details.className='sources';summary.textContent='Fontes consultadas';for(const source of result.sources){const url=webUrl(source.url);if(!url)continue;const li=document.createElement('li'),a=document.createElement('a');a.textContent=source.title||new URL(url).hostname;a.href=url;a.onclick=e=>{e.preventDefault();window.aluguito.call('open-link',url).catch(()=>{});};li.append(a);list.append(li);}details.append(summary,list);container.append(details);}
    if(result.searchHtml){const frame=document.createElement('iframe');frame.className='search-suggestions';frame.title='Sugestões do Google Search';frame.setAttribute('sandbox','allow-popups allow-popups-to-escape-sandbox');frame.setAttribute('referrerpolicy','no-referrer');const safe=DOMPurify.sanitize(result.searchHtml,{ADD_TAGS:['style'],ADD_ATTR:['target'],FORBID_TAGS:['script','iframe','form','input','object','embed'],FORBID_ATTR:['srcdoc'],ALLOW_DATA_ATTR:false});frame.srcdoc=`<!doctype html><html><head><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; img-src https: data:; base-uri 'none'; form-action 'none'"></head><body>${safe}</body></html>`;container.append(frame);}
  }
  window.AluguitoRich={markdown,images,extras,webUrl};
})();
