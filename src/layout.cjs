const clamp=(v,min,max)=>Math.max(min,Math.min(v,Math.max(min,max)));
function petSize(scale){scale=clamp(Number(scale)||.8,.45,1.6);return{width:Math.max(210,Math.round(192*scale+32)),height:Math.round(208*scale+76)};}
function computeLayout({pet,area,expanded,position='left',size={width:520,height:640},offset,autoSide=false}){
 const margin=8,gap=4,p={...pet};p.x=clamp(p.x,area.x+margin,area.x+area.width-p.width-margin);p.y=clamp(p.y,area.y+margin,area.y+area.height-p.height-margin);
 if(!expanded)return{bounds:{...p},pet:{...p},panel:null,position};
 let width=clamp(Number(size.width)||520,Math.min(340,area.width-16),area.width-16),height=clamp(Number(size.height)||640,Math.min(360,area.height-16),area.height-16),side=position;
 if(['left','right'].includes(side)&&area.width<p.width+300+gap+16)side='above';
 if(['left','right'].includes(side)){
  width=Math.min(width,Math.max(300,area.width-p.width-gap-16));
  const leftRoom=p.x-area.x-margin-gap,rightRoom=area.x+area.width-margin-p.x-p.width-gap;
  if(autoSide&&side==='left'&&leftRoom<width&&rightRoom>=width)side='right';
  else if(autoSide&&side==='right'&&rightRoom<width&&leftRoom>=width)side='left';
  if(side==='left')p.x=Math.max(p.x,area.x+margin+width+gap);
  else p.x=Math.min(p.x,area.x+area.width-margin-p.width-width-gap);
 }
 let panel;
 if(side==='free'&&offset)panel={x:p.x+offset.x,y:p.y+offset.y,width,height};
 else if(side==='above'){height=Math.max(80,Math.min(height,area.height-p.height-gap-16));p.y=Math.max(p.y,area.y+margin+height+gap);panel={x:p.x+p.width-width,y:p.y-height-gap,width,height};}
 else panel={x:side==='right'?p.x+p.width+gap:p.x-width-gap,y:p.y+p.height-height,width,height};
 panel.x=clamp(panel.x,area.x+margin,area.x+area.width-panel.width-margin);panel.y=clamp(panel.y,area.y+margin,area.y+area.height-panel.height-margin);
 const x=Math.min(p.x,panel.x),y=Math.min(p.y,panel.y),right=Math.max(p.x+p.width,panel.x+panel.width),bottom=Math.max(p.y+p.height,panel.y+panel.height);
 return{bounds:{x:Math.round(x),y:Math.round(y),width:Math.round(right-x),height:Math.round(bottom-y)},pet:p,panel,position:side};
}
function appearance(layout,scale,expanded){const local=r=>r?{x:r.x-layout.bounds.x,y:r.y-layout.bounds.y,width:r.width-16,height:r.height-16}:null;return{expanded,petScale:scale,layout:{pet:local(layout.pet),panel:local(layout.panel),position:layout.position}};}
module.exports={petSize,computeLayout,appearance,clamp};
