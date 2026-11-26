'use strict';

const $ = id => document.getElementById(id);
const icons = {
  layout:'M3 3h18v18H3zM3 9h18m-7 0v12', folder:'M3 6h7l2 2h9v12H3z',
  upload:'M12 16V3m-5 5 5-5 5 5M4 15v6h16v-6',download:'M12 3v13m-5-5 5 5 5-5M4 16v5h16v-5',
  plus:'M12 5v14M5 12h14',minus:'M5 12h14',undo:'M9 5 4 10l5 5m-5-5h10a6 6 0 0 1 0 12',
  redo:'m15 5 5 5-5 5m5-5H10a6 6 0 0 0 0 12',grid:'M3 3h18v18H3zM3 9h18M3 15h18M9 3v18m6-18v18',
  magnet:'M4 5h5v8a3 3 0 0 0 6 0V5h5v8a8 8 0 0 1-16 0zM4 9h5m6 0h5',
  fit:'M9 4H4v5m11-5h5v5M4 15v5h5m11-5v5h-5M9 9h6v6H9z',
  rotate:'M3 11a9 9 0 1 1 3 8m-3-8V4m0 7h7',copy:'M8 8h12v12H8zM16 8V4H4v12h4',
  trash:'M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13m-8 4v5m4-5v5',
  settings:'M4 6h16M4 12h16M4 18h16M8 4v4m8 2v4m-6 2v4',
  edit:'m4 15-1 6 6-1L21 8l-5-5zM13 6l5 5',close:'m6 6 12 12M18 6 6 18',
  shelf:'M4 5h16v14H4zM4 10h16M4 15h16'
};
const icon = name => '<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="'+icons[name]+'"/></svg>';
document.querySelectorAll('[data-icon]').forEach(el => el.insertAdjacentHTML('afterbegin', icon(el.dataset.icon)));
const esc = value => String(value).replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const uid = () => globalThis.crypto?.randomUUID?.() ?? Date.now().toString(36)+Math.random().toString(36).slice(2);
const clone = value => JSON.parse(JSON.stringify(value));
const round = n => Math.round(n * 1000) / 1000;
const number = n => n !== 0 && Math.abs(n)<.001 ? n.toExponential(2) : Number(n).toLocaleString('zh-CN',{maximumFractionDigits:2});
const colors = ['#b3c9fc','#a2e5d0','#fbd2a4','#d5c0fa','#f5bcca','#f3df94','#a6dbe9','#536682'];
const defaultFixtures = [
  {id:'shelf',name:'三层架',width:1200,depth:450,color:colors[0]},
  {id:'bags',name:'包包三层架',width:2000,depth:2000,color:colors[1]},
  {id:'zaag',name:'ZaaG饰品台',width:6000,depth:4000,color:colors[3]},
  {id:'rear',name:'流水台后桌',width:1170,depth:400,color:colors[2]},
  {id:'front',name:'流水台前桌',width:970,depth:400,color:colors[4]}
];
function defaultLibrary(){
  const members=defaultFixtures.slice(3).map(({name,width,depth,color},index)=>({
    name,width,depth,color,offsetX:0,offsetY:index===0?-200:200
  }));
  return [{id:'group',name:'流水台',members},...clone(defaultFixtures)];
}
function rectangle(width,length){
  return [{x:0,y:0},{x:width,y:0},{x:width,y:length},{x:0,y:length}];
}
function createPlan(name,points,kind){
  return {id:uid(),name,points,kind,fixtures:[],grid:true,snap:true,step:100};
}
function fixture(type,x,y,rotation=0){
  return {id:uid(),name:type.name,width:type.width,depth:type.depth,color:type.color,x,y,rotation};
}
function initialState(){
  const sample = createPlan('示例卖场',rectangle(14000,9000),'rect');
  const layout = [
    [0,1600,950,0],[0,3150,950,0],[0,4700,950,0],[1,2200,3450,0],
    [2,7900,4750,0],[0,13000,2700,90],[0,13000,4400,90],[0,13000,6100,90],
    [3,2500,6480,0],[4,2500,6880,0],[1,11200,7370,0]
  ];
  sample.fixtures = layout.map(([type,x,y,angle]) => fixture(defaultFixtures[type],x,y,angle));
  return {plans:[sample],active:sample.id};
}
const storageKey = 'retail-floor-plan-v1';
let state;
try {
  state = JSON.parse(localStorage.getItem(storageKey));
} catch {
  state = null;
}
if (!Array.isArray(state?.plans) || !state.plans.some(p => p.id === state.active)) {
  state={...initialState(),library:state?.library};
}
if (!Array.isArray(state.library)) state.library=defaultLibrary();
const plan = () => state.plans.find(p => p.id === state.active);
let selection = null;
let draw = null;
let toastTimer;
const past = [], future = [];
const svg = $('plan');
const dialog = $('dialog');
const camera = {x:0,y:0,scale:1,base:1};
function toast(message){
  $('toast').textContent = message;
  $('toast').hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => $('toast').hidden = true,3200);
}
function save(){
  try {
    localStorage.setItem(storageKey,JSON.stringify(state));
    $('save-status').textContent = '已保存到本机';
  } catch {
    $('save-status').textContent = '本机保存失败，请导出备份';
  }
}
function remember(before){
  past.push(before);
  if (past.length > 60) past.shift();
  future.length = 0;
  save();
}
function change(action,fit=false){
  const before = clone(state);
  action();
  remember(before);
  if (fit) fitView();
  refresh();
}
function history(from,to){
  if (!from.length || draw || pointers.size) return;
  const active = state.active;
  to.push(clone(state));
  state = from.pop();
  if (active !== state.active) {
    selection = null;
    fitView();
  }
  save();
  refresh();
}
function bounds(points){
  const x = points.map(p => p.x), y = points.map(p => p.y);
  return {left:Math.min(...x),top:Math.min(...y),right:Math.max(...x),bottom:Math.max(...y)};
}
function area(points){
  return Math.abs(points.reduce((sum,p,i) => {
    const next = points[(i+1)%points.length];
    return sum+(p.x*next.y-next.x*p.y);
  },0))/2e6;
}
function normalize(points,fixtures=[]){
  const {left,top} = bounds(points);
  points.forEach(p => {p.x-=left;p.y-=top;});
  fixtures.forEach(f => {f.x-=left;f.y-=top;});
  return {left,top};
}
function validPolygon(points){
  if (points.length < 3 || points.length > 500 || area(points) <= 0) return false;
  const cross = (a,b,c) => Math.sign((b.x-a.x)*(c.y-a.y)-(b.y-a.y)*(c.x-a.x));
  const on = (a,b,c) => c.x>=Math.min(a.x,b.x) && c.x<=Math.max(a.x,b.x) && c.y>=Math.min(a.y,b.y) && c.y<=Math.max(a.y,b.y);
  return points.every((a,i) => {
    const b=points[(i+1)%points.length];
    if (a.x===b.x && a.y===b.y) return false;
    const previous=points[(i+points.length-1)%points.length];
    if (!cross(previous,a,b) && ((previous.x-a.x)*(b.x-a.x)+(previous.y-a.y)*(b.y-a.y))>0) return false;
    return points.every((c,j) => {
      if (j<=i+1 || (i===0 && j===points.length-1)) return true;
      const d=points[(j+1)%points.length];
      const abC=cross(a,b,c), abD=cross(a,b,d), cdA=cross(c,d,a), cdB=cross(c,d,b);
      return !((abC*abD<0 && cdA*cdB<0) || (!abC && on(a,b,c)) || (!abD && on(a,b,d)) || (!cdA && on(c,d,a)) || (!cdB && on(c,d,b)));
    });
  });
}
function contentBounds(p){
  const points = [...p.points];
  for (const f of p.fixtures) {
    const angle=f.rotation*Math.PI/180;
    const dx=(Math.abs(f.width*Math.cos(angle))+Math.abs(f.depth*Math.sin(angle)))/2;
    const dy=(Math.abs(f.width*Math.sin(angle))+Math.abs(f.depth*Math.cos(angle)))/2;
    points.push({x:f.x-dx,y:f.y-dy},{x:f.x+dx,y:f.y+dy});
  }
  return bounds(points);
}
function fitView(){
  const b = draw ? bounds([...rectangle(draw.width,draw.length),...draw.points]) : contentBounds(plan());
  const width = Math.max(svg.clientWidth,1), height = Math.max(svg.clientHeight,1);
  camera.scale = Math.min(width*.76/Math.max(b.right-b.left,1),height*.73/Math.max(b.bottom-b.top,1));
  camera.base = camera.scale;
  camera.x = (b.left+b.right)/2-width/2/camera.scale;
  camera.y = (b.top+b.bottom)/2-height/2/camera.scale;
  render();
}
function world(point){
  return {x:camera.x+point.x/camera.scale,y:camera.y+point.y/camera.scale};
}
function snap(value){
  return plan().snap ? Math.round(value/plan().step)*plan().step : round(value);
}
function zoomAt(point,factor){
  const anchor = world(point);
  setZoom(anchor,point,camera.scale*factor);
  render();
}
function setZoom(anchor,point,scale){
  camera.scale = Math.min(camera.base*160,Math.max(camera.base*.025,scale));
  camera.x = anchor.x-point.x/camera.scale;
  camera.y = anchor.y-point.y/camera.scale;
}
const path = points => points.map(p => p.x+','+p.y).join(' ');
function niceLength(value){
  const power = 10**Math.floor(Math.log10(value));
  return ([5,2,1].find(n => n*power<=value) ?? 1)*power;
}
function scaleMark(x,y,u){
  const length = niceLength(96*u);
  const label = length >= 1000 ? number(length/1000)+' m' : number(Math.round(length))+' mm';
  return '<g transform="translate('+x+' '+y+')" fill="#435775"><path d="M0 '+(-5*u)+'V0H'+length+'V'+(-5*u)+'" fill="none" stroke="#435775" stroke-width="'+1.5*u+'"/><text x="'+length/2+'" y="'+(-8*u)+'" text-anchor="middle" font-size="'+12*u+'">'+label+'</text></g>';
}
function dimension(a,b,u,side=1,gap=15,rotation=0){
  const dx=b.x-a.x,dy=b.y-a.y, length=Math.hypot(dx,dy);
  if (!length) return '';
  const offsetX=side*dy/length*u*gap, offsetY=-side*dx/length*u*gap;
  let angle=Math.atan2(dy,dx)*180/Math.PI;
  const orientation=((angle+rotation)%360+360)%360;
  if (orientation>90 && orientation<=270) angle+=180;
  const x=(a.x+b.x)/2+offsetX,y=(a.y+b.y)/2+offsetY;
  return '<g pointer-events="none"><path d="M'+(a.x+offsetX)+' '+(a.y+offsetY)+'L'+(b.x+offsetX)+' '+(b.y+offsetY)+' M'+a.x+' '+a.y+'l'+offsetX*1.22+' '+offsetY*1.22+' M'+b.x+' '+b.y+'l'+offsetX*1.22+' '+offsetY*1.22+'" fill="none" stroke="#7084a5" stroke-width="'+u+'"/><text transform="translate('+x+' '+y+') rotate('+angle+')" y="'+(-3*u)+'" text-anchor="middle" font-size="'+12*u+'" fill="#425778" stroke="#fff" stroke-width="'+3*u+'" paint-order="stroke">'+number(length)+' mm</text></g>';
}
function contrast(color){
  const rgb = [1,3,5].map(i => parseInt(color.slice(i,i+2),16)/255).map(x => x<=.04045 ? x/12.92 : ((x+.055)/1.055)**2.4);
  return rgb[0]*.2126+rgb[1]*.7152+rgb[2]*.0722>.179 ? '#000000' : '#ffffff';
}
const measure = document.createElement('canvas').getContext('2d');
const svgFont = 'system-ui, sans-serif';
function fitText(text,width,maxSize,weight){
  measure.font = weight+' 100px '+svgFont;
  const metrics = measure.measureText(text);
  const halfWidth = Math.max(metrics.width/2,metrics.width/2+(metrics.actualBoundingBoxLeft || 0),
    (metrics.actualBoundingBoxRight || 0)-metrics.width/2);
  return Math.min(maxSize,width*50/Math.max(halfWidth,.01));
}
function fixtureMarkup(f,u,isSelected,exporting){
  const turn = ((f.rotation%360)+360)%360;
  const angle = turn>90 && turn<=270 ? 180 : 0;
  measure.font = '600 100px '+svgFont;
  const textWidth = Math.max(measure.measureText(f.name).width/100,.01);
  const size = exporting ? fitText(f.name,f.width*.84,Math.min(f.depth*.34,22*u),600) :
    Math.min(f.depth*.43,f.width*.9/textWidth,22*u);
  const details = exporting || (f.depth>42*u && f.width>90*u && size>=10*u);
  const dimensions = details ? number(f.width)+' × '+number(f.depth) : '';
  const detailSize = exporting ? fitText(dimensions,f.width*.84,Math.min(f.depth*.23,12*u),400) :
    Math.min(10*u,f.width*.085);
  return '<g data-testid="fixture" data-item="'+f.id+'" transform="translate('+f.x+' '+f.y+') rotate('+f.rotation+')" aria-label="'+esc(f.name)+'">'+
    '<rect x="'+(-f.width/2)+'" y="'+(-f.depth/2)+'" width="'+f.width+'" height="'+f.depth+'" rx="'+Math.min(f.depth*.1,f.width*.1,5*u)+'" fill="'+f.color+'" stroke="'+(isSelected?'#2859e9':'#405880')+'" stroke-opacity="'+(isSelected?1:.55)+'" stroke-width="'+(isSelected?2.5:1)*u+'"/>'+
    '<g transform="rotate('+angle+')" fill="'+contrast(f.color)+'" text-anchor="middle" pointer-events="none">'+
    '<text y="'+(exporting?-size*.6:details?-7*u:0)+'" dominant-baseline="central" font-size="'+size+'" font-weight="600">'+esc(f.name)+'</text>'+
    (details?'<text y="'+(exporting?detailSize*.6:11*u)+'" dominant-baseline="central" font-size="'+detailSize+'">'+dimensions+'</text>':'')+'</g>'+
    (isSelected && !exporting ?
      dimension({x:-f.width/2,y:-f.depth/2},{x:f.width/2,y:-f.depth/2},u,1,10,f.rotation)+
      dimension({x:f.width/2,y:-f.depth/2},{x:f.width/2,y:f.depth/2},u,1,10,f.rotation) : '')+'</g>';
}
function gridMarkup(x,y,w,h,u){
  const step=plan().step;
  let visual=step;
  while(visual<11*u) visual*=5;
  const major=visual*5;
  return '<defs><pattern id="grid" patternUnits="userSpaceOnUse" width="'+visual+'" height="'+visual+'"><path d="M'+visual+' 0H0V'+visual+'" fill="none" stroke="#ccd9ed" stroke-width="'+u+'"/></pattern><pattern id="major" patternUnits="userSpaceOnUse" width="'+major+'" height="'+major+'"><path d="M'+major+' 0H0V'+major+'" fill="none" stroke="#afc3e1" stroke-width="'+1.2*u+'"/></pattern></defs>'+
    '<rect x="'+x+'" y="'+y+'" width="'+w+'" height="'+h+'" fill="url(#grid)"/><rect x="'+x+'" y="'+y+'" width="'+w+'" height="'+h+'" fill="url(#major)"/>';
}
function planMarkup(p,u,exporting=false){
  const venueSelected=!exporting && selection==='venue';
  const outline='<polygon data-venue="true" points="'+path(p.points)+'" fill="'+(exporting?'#fff':'#ffffffac')+'" stroke="'+(venueSelected?'#2859e9':'#405880')+'" stroke-width="'+2*u+'"/>';
  const signed = p.points.reduce((sum,a,i) => {
    const b=p.points[(i+1)%p.points.length];
    return sum+a.x*b.y-b.x*a.y;
  },0);
  const dimensions = (p.kind==='rect'?[0,3]:p.points.map((_,i)=>i)).map(i =>
    dimension(p.points[i],p.points[(i+1)%p.points.length],u,Math.sign(signed))).join('');
  const handles = venueSelected && p.kind==='polygon' ? p.points.map((point,i) =>
    '<circle data-vertex="'+i+'" cx="'+point.x+'" cy="'+point.y+'" r="'+9*u+'" fill="#fff" stroke="#2859e9" stroke-width="'+2*u+'"/>').join('') : '';
  return outline+dimensions+p.fixtures.map(f => fixtureMarkup(f,u,!exporting && selection===f.id,exporting)).join('')+handles;
}
function render(){
  const u=1/camera.scale,w=Math.max(svg.clientWidth,1)*u,h=Math.max(svg.clientHeight,1)*u;
  svg.setAttribute('viewBox',[camera.x,camera.y,w,h].join(' '));
  svg.setAttribute('font-family',svgFont);
  let scene = plan().grid || draw ? gridMarkup(camera.x,camera.y,w,h,u) : '';
  if (draw) {
    scene += '<polyline points="'+path(draw.points)+'" fill="none" stroke="#2859e9" stroke-width="'+2*u+'"/>';
    scene += draw.points.map((point,i) => '<circle data-draw-point="'+i+'" cx="'+point.x+'" cy="'+point.y+'" r="'+8*u+'" fill="'+(i?'#2859e9':'#fff')+'" stroke="#2859e9" stroke-width="'+2*u+'"/>').join('');
    $('draw-count').textContent = draw.points.length+' 个顶点';
    $('draw-close').disabled = draw.points.length<3;
  } else {
    scene += planMarkup(plan(),u);
  }
  svg.innerHTML = scene+scaleMark(camera.x+15*u,camera.y+h-19*u,u);
  $('selection-bar').hidden = !!draw || !selectedFixture();
  $('draw-bar').hidden = !draw;
  $('zoom-value').textContent = Math.round(camera.scale/camera.base*100)+'%';
}
function selectedFixture(){
  return plan().fixtures.find(f => f.id===selection);
}
function field(label,id,value,options=''){
  return '<label class="field">'+label+'<input id="'+id+'" value="'+esc(value)+'" '+options+'></label>';
}
const positive='type="number" min="0.001" max="1000000000" step="any" required';
function properties(){
  const p=plan(), f=selectedFixture(), b=bounds(p.points);
  const head = title => '<div class="panel-heading"><h2>'+title+'</h2><button id="properties-close" aria-label="关闭属性">'+icon('close')+'</button></div>';
  const metric = (label,value) => '<div class="metric"><span>'+label+'</span><strong>'+value+'</strong></div>';
  $('properties').innerHTML = f ? head('货架属性')+'<form id="properties-form" class="property-content"><div class="fields">'+
    '<label class="field full">名称<input id="placed-name" maxlength="100" required value="'+esc(f.name)+'"></label>'+
    field('X · mm','placed-x',f.x,'type="number" step="any" required')+
    field('Y · mm','placed-y',f.y,'type="number" step="any" required')+
    field('宽 · mm','placed-w',f.width,positive)+field('深 · mm','placed-d',f.depth,positive)+
    field('旋转 · °','placed-r',f.rotation,'type="number" step="any" required')+field('颜色','placed-c',f.color,'type="color"')+
    '</div><p class="hint">坐标表示货架中心位置。</p><button class="primary">应用属性</button></form>' :
    head('场地信息')+'<div class="property-content"><p class="muted">'+(p.kind==='rect'?'矩形场地':'多边形场地')+'</p><div class="metrics">'+
    metric('场地面积',number(area(p.points))+' m²')+metric('已放货架',p.fixtures.length+' 件')+
    metric('外接宽度',number(b.right-b.left)+' mm')+metric('外接长度',number(b.bottom-b.top)+' mm')+
    '</div><p class="hint">'+(p.kind==='polygon'?'点击场地可选中轮廓并拖动顶点。':'点击货架后，可拖动调整位置。')+'</p>'+
    '<button id="select-venue" class="outline">'+(p.kind==='polygon'?'选择场地顶点':'选择场地')+'</button></div>';
  $('properties-close').onclick = () => {
    $('properties').classList.remove('open');
    selection=null;
    render();
    properties();
  };
  if (!f) {
    $('select-venue').onclick=()=>{selection='venue';$('properties').classList.remove('open');render();};
    return;
  }
  $('properties-form').onsubmit = event => {
    event.preventDefault();
    const name=$('placed-name').value.trim(), values=['x','y','w','d','r'].map(key=>$('placed-'+key).valueAsNumber);
    if (!name || values.some(value=>!Number.isFinite(value)||Math.abs(value)>1e9)) return toast('请检查名称和数值');
    const [x,y,width,depth,angle]=values;
    change(()=>Object.assign(f,{name,x,y,width,depth,rotation:angle%360,color:$('placed-c').value}));
  };
}
function library(){
  $('library-list').innerHTML=state.library.map(type=>{
    const id=esc(type.id);
    const color=type.members?type.members[0].color:type.color;
    const detail=type.members?type.members.length+' 件组合':number(type.width)+' × '+number(type.depth)+' mm';
    return '<div class="library-card"><button data-place="'+id+'"><span class="preview" style="--tile:'+esc(color)+'">'+icon('shelf')+'</span><span><strong>'+esc(type.name)+'</strong><small>'+detail+'</small></span></button>'+
      '<button data-edit="'+id+'" aria-label="编辑 '+esc(type.name)+'">编辑</button>'+
      '<button data-delete="'+id+'" class="danger" aria-label="删除 '+esc(type.name)+'">删除</button></div>';
  }).join('')||'<p class="muted">货架库为空</p>';
}
function refresh(){
  const p=plan();
  if (selection!=='venue' && !selectedFixture()) selection=null;
  $('plan-name').textContent=p.name;
  $('plan-area').textContent=number(area(p.points))+' m²';
  $('grid-btn').setAttribute('aria-pressed',p.grid);
  $('snap-btn').setAttribute('aria-pressed',p.snap);
  $('snap-size').value=p.step;
  $('undo').disabled=!past.length || !!draw;
  $('redo').disabled=!future.length || !!draw;
  properties();
  library();
  render();
}
function modal(title,body,footer=''){
  dialog.innerHTML='<div class="modal-head"><h2>'+title+'</h2><button id="modal-close" type="button" aria-label="关闭">'+icon('close')+'</button></div>'+body+footer;
  $('modal-close').onclick=()=>dialog.close();
  if (!dialog.open) dialog.showModal();
}
const foot=content=>'<div class="modal-foot">'+content+'</div>';
const shapes={
  L:[[0,0],[9000,0],[9000,4500],[5000,4500],[5000,9000],[0,9000]],
  T:[[2500,0],[6500,0],[6500,2500],[9000,2500],[9000,7500],[0,7500],[0,2500],[2500,2500]]
};
function activate(p){
  state.active=p.id;
  selection=null;
  draw=null;
  $('properties').classList.remove('open');
}
function addPlan(name,points,kind){
  normalize(points);
  const p=createPlan(name,points,kind);
  change(()=>{state.plans.push(p);activate(p);},true);
}
function newVenue(){
  if (draw) return toast('请先完成或取消当前绘制');
  modal('建立新场地','<form id="venue-form"><div class="modal-body"><div class="tabs"><button type="button" id="tab-rect" class="active">矩形</button><button type="button" id="tab-poly" data-testid="tab-polygon">多边形</button></div>'+
    field('场地名称','venue-name','新卖场','maxlength="100" required data-testid="venue-name"')+
    '<div id="rect-fields" class="fields">'+field('宽 · mm','venue-width',9000,positive+' data-testid="venue-width"')+field('长 · mm','venue-length',14000,positive+' data-testid="venue-length"')+'</div>'+
    '<div id="poly-fields" hidden><p class="hint">按边界顺序输入坐标，或在画布上点选顶点。</p><div class="row-actions"><button type="button" id="shape-l" class="outline">L形</button><button type="button" id="shape-t" class="outline">凸形</button><button type="button" id="draw-start" class="outline">在画布上绘制</button></div><table class="vertex-table"><thead><tr><th>X · mm</th><th>Y · mm</th><th></th></tr></thead><tbody id="vertex-rows"></tbody></table><button type="button" id="add-vertex">'+icon('plus')+'添加顶点</button></div></div>'+
    foot('<button type="submit" class="primary" data-testid="btn-create-venue">建立场地</button>')+'</form>');
  let kind='rect';
  function appendRow(x='',y=''){
    if ($('vertex-rows').children.length>=500) return toast('最多可添加 500 个顶点');
    const row=$('vertex-rows').insertRow();
    row.innerHTML='<td><input type="number" step="any" aria-label="顶点 X" value="'+x+'"></td><td><input type="number" step="any" aria-label="顶点 Y" value="'+y+'"></td><td><button type="button" aria-label="移除顶点">'+icon('trash')+'</button></td>';
    row.querySelector('button').onclick=()=>row.remove();
  }
  function applyShape(shape){
    $('vertex-rows').replaceChildren();
    shape.forEach(([x,y])=>appendRow(x,y));
  }
  applyShape(shapes.L);
  function tab(next){
    kind=next;
    const polygon=kind==='polygon';
    $('rect-fields').hidden=polygon;
    $('poly-fields').hidden=!polygon;
    $('venue-width').disabled=polygon;
    $('venue-length').disabled=polygon;
    $('tab-rect').classList.toggle('active',!polygon);
    $('tab-poly').classList.toggle('active',polygon);
  }
  $('tab-rect').onclick=()=>tab('rect');
  $('tab-poly').onclick=()=>tab('polygon');
  $('shape-l').onclick=()=>applyShape(shapes.L);
  $('shape-t').onclick=()=>applyShape(shapes.T);
  $('add-vertex').onclick=()=>appendRow();
  $('draw-start').onclick=()=>{
    const name=$('venue-name').value.trim();
    if (!name) return toast('请输入场地名称');
    draw={name,points:[],width:9000,length:9000,savedCamera:{...camera}};
    $('library-panel').classList.remove('open');
    $('properties').classList.remove('open');
    dialog.close();
    fitView();
    refresh();
    toast('点击画布添加顶点，拖动空白处可平移');
  };
  $('venue-form').onsubmit=event=>{
    event.preventDefault();
    const name=$('venue-name').value.trim();
    if (!name) return toast('请输入场地名称');
    const points=kind==='rect' ? rectangle($('venue-width').valueAsNumber,$('venue-length').valueAsNumber) :
      [...$('vertex-rows').rows].map(row=>{
        const [x,y]=row.querySelectorAll('input');
        return {x:x.valueAsNumber,y:y.valueAsNumber};
      });
    if (!points.every(p=>[p.x,p.y].every(n=>Number.isFinite(n)&&Math.abs(n)<=1e9)) || !validPolygon(points)) return toast('请输入有效坐标，边线不能交叉');
    dialog.close();
    addPlan(name,points,kind);
  };
}
function typeEditor(type){
  modal(type?'编辑货架':'新增货架','<form id="type-form"><div class="modal-body"><div class="fields">'+
    field('货架名称','fixture-name',type?.name??'','required maxlength="100" data-testid="fixture-name"')+
    field('颜色','fixture-color',type?.color??colors[0],'type="color" data-testid="fixture-color"')+
    field('宽 · mm','fixture-width',type?.width??1200,positive+' data-testid="fixture-width"')+
    field('深 · mm','fixture-depth',type?.depth??450,positive+' data-testid="fixture-depth"')+
    '</div><p class="hint">常用颜色</p><div class="swatches">'+colors.map(color=>'<button type="button" data-swatch="'+color+'" aria-label="颜色 '+color+'"><span style="--swatch:'+color+'"></span></button>').join('')+'</div></div>'+
    foot((type?'<button type="button" id="remove-type" class="danger">删除货架</button>':'')+'<button type="submit" class="primary" data-testid="btn-save-fixture">保存货架</button>')+'</form>');
  dialog.querySelector('.swatches').onclick=event=>{
    const color=event.target.closest('[data-swatch]')?.dataset.swatch;
    if (color) $('fixture-color').value=color;
  };
  if (type) $('remove-type').onclick=()=>{
    if (deleteType(type)) dialog.close();
  };
  $('type-form').onsubmit=event=>{
    event.preventDefault();
    const name=$('fixture-name').value.trim();
    if (!name) return toast('请输入货架名称');
    const entry={id:type?.id??uid(),name,width:$('fixture-width').valueAsNumber,depth:$('fixture-depth').valueAsNumber,color:$('fixture-color').value};
    change(()=>{
      if (type) Object.assign(type,entry);
      else state.library.push(entry);
    });
    dialog.close();
  };
}
function deleteType(type){
  if (!confirm('删除“'+type.name+'”？')) return false;
  change(()=>state.library=state.library.filter(entry=>entry.id!==type.id));
  return true;
}
function groupEditor(type){
  const options=state.library.filter(entry=>!entry.members);
  const offset='type="number" min="-1000000000" max="1000000000" step="any" required';
  modal(type?'编辑组合货架':'新建组合货架','<form id="group-form"><div class="modal-body">'+
    field('组合名称','fixture-name',type?.name??'','required maxlength="100" data-testid="fixture-name"')+
    '<p class="hint">至少添加 2 件成员。偏移以组合摆放点为原点，X 向右、Y 向下。</p>'+
    '<div class="group-picker"><select id="member-picker" aria-label="选择库内货架">'+
    (options.map(entry=>'<option value="'+esc(entry.id)+'">'+esc(entry.name)+'</option>').join('')||
      '<option value="">请先新增单件货架</option>')+
    '</select><button type="button" id="add-member">添加成员</button></div><div id="group-members"></div></div>'+
    foot('<button type="submit" class="primary" data-testid="btn-save-fixture">保存货架</button>')+'</form>');
  let nextMember=0;
  function appendMember(member){
    const key='member-'+nextMember++;
    const row=document.createElement('fieldset');
    row.className='group-member';
    row.innerHTML='<div class="fields">'+
      field('名称',key+'-name',member.name,'required maxlength="100"')+
      field('颜色',key+'-color',member.color,'type="color"')+
      field('宽 · mm',key+'-width',member.width,positive)+
      field('深 · mm',key+'-depth',member.depth,positive)+
      field('X 偏移 · mm',key+'-x',member.offsetX,offset)+
      field('Y 偏移 · mm',key+'-y',member.offsetY,offset)+
      '</div><button type="button" class="danger">移除成员</button>';
    row.querySelector('button').onclick=()=>row.remove();
    $('group-members').append(row);
  }
  type?.members.forEach(appendMember);
  $('add-member').disabled=!options.length;
  $('add-member').onclick=()=>{
    const member=options.find(entry=>entry.id===$('member-picker').value);
    const last=$('group-members').lastElementChild;
    let offsetY=0;
    if (last) {
      const inputs=last.querySelectorAll('input');
      offsetY=(Number(inputs[5].value)||0)+(Number(inputs[3].value)+member.depth)/2;
    }
    appendMember({...member,offsetX:0,offsetY});
  };
  $('group-form').onsubmit=event=>{
    event.preventDefault();
    const name=$('fixture-name').value.trim();
    const members=[...$('group-members').children].map(row=>{
      const [name,color,width,depth,x,y]=row.querySelectorAll('input');
      return {name:name.value.trim(),color:color.value,width:width.valueAsNumber,depth:depth.valueAsNumber,
        offsetX:x.valueAsNumber,offsetY:y.valueAsNumber};
    });
    if (!name || members.some(member=>!member.name)) return toast('请输入组合和成员名称');
    if (members.length<2) return toast('请添加至少 2 件成员');
    change(()=>{
      if (type) Object.assign(type,{name,members});
      else state.library.push({id:uid(),name,members});
    });
    dialog.close();
  };
}
function place(id){
  if (draw) return toast('请先完成或取消当前绘制');
  const center=world({x:svg.clientWidth/2,y:svg.clientHeight/2});
  const x=snap(center.x),y=snap(center.y);
  const type=state.library.find(entry=>entry.id===id);
  if (!type) return;
  const entries=type.members
    ? type.members.map(member=>fixture(member,x+member.offsetX,y+member.offsetY))
    : [fixture(type,x,y)];
  change(()=>{
    plan().fixtures.push(...entries);
    selection=entries[0].id;
  });
  $('library-panel').classList.remove('open');
}
function planList(){
  if (draw) return toast('请先完成或取消当前绘制');
  modal('方案管理','<div class="modal-body">'+state.plans.map(p=>'<div class="plan-row" data-plan="'+p.id+'"><button data-op="open" class="'+(state.active===p.id?'outline':'')+'">'+esc(p.name)+'</button><button data-op="rename" aria-label="重命名" title="重命名">'+icon('edit')+'</button><button data-op="copy" aria-label="复制" title="复制">'+icon('copy')+'</button><button data-op="delete" aria-label="删除" title="删除">'+icon('trash')+'</button></div>').join('')+'</div>',
    foot('<button id="plans-new" class="primary">'+icon('plus')+'新建场地</button>'));
  $('plans-new').onclick=newVenue;
  for (const row of dialog.querySelectorAll('.plan-row')) row.onclick=event=>{
    const p=state.plans.find(entry=>entry.id===row.dataset.plan);
    const op=event.target.closest('[data-op]')?.dataset.op;
    if (op==='open') {
      if (state.active!==p.id) change(()=>activate(p),true);
      dialog.close();
    } else if (op==='copy') {
      const copy={...clone(p),id:uid(),name:(p.name.slice(0,95)+' 副本')};
      change(()=>{state.plans.push(copy);activate(copy);},true);
      dialog.close();
    } else if (op==='rename') {
      modal('重命名方案','<form id="rename-form"><div class="modal-body">'+field('方案名称','rename-value',p.name,'required maxlength="100"')+'</div>'+foot('<button class="primary">保存名称</button>')+'</form>');
      $('rename-form').onsubmit=e=>{
        e.preventDefault();
        const name=$('rename-value').value.trim();
        if (!name) return toast('请输入方案名称');
        change(()=>p.name=name);
        planList();
      };
    } else if (op==='delete') {
      modal('删除方案','<div class="modal-body">删除「'+esc(p.name)+'」？</div>',foot('<button id="delete-cancel">取消</button><button id="delete-confirm" class="danger">删除方案</button>'));
      $('delete-cancel').onclick=planList;
      $('delete-confirm').onclick=()=>{
        const active=state.active===p.id;
        change(()=>{
          state.plans=state.plans.filter(entry=>entry.id!==p.id);
          if (!state.plans.length) state.plans.push(createPlan('新卖场',rectangle(9000,14000),'rect'));
          if (active) activate(state.plans[0]);
        },active);
        planList();
      };
    }
  };
}
const pointers=new Map();
let gesture=null;
let gestureBefore=null;
let edited=false;
function localPoint(event){
  const b=svg.getBoundingClientRect();
  return {x:event.clientX-b.left,y:event.clientY-b.top};
}
function pair(){
  const [a,b]=pointers.values();
  return {mid:{x:(a.x+b.x)/2,y:(a.y+b.y)/2},distance:Math.max(1,Math.hypot(a.x-b.x,a.y-b.y))};
}
function startPinch(){
  const {mid,distance}=pair();
  gesture={kind:'pinch',anchor:world(mid),distance,scale:camera.scale};
}
svg.addEventListener('pointerdown',event=>{
  if (event.button!==0 || pointers.size>=2) return;
  const point=localPoint(event);
  svg.setPointerCapture(event.pointerId);
  pointers.set(event.pointerId,point);
  if (pointers.size===2) {
    startPinch();
    return;
  }
  const target=event.target;
  const item=target.closest('[data-item]')?.dataset.item;
  const vertex=target.closest('[data-vertex]')?.dataset.vertex;
  const fixture=plan().fixtures.find(f=>f.id===item);
  const node=vertex===undefined ? fixture : plan().points[Number(vertex)];
  gesture={
    kind:draw?'draw':node?'move':'pan', point, start:world(point),
    origin:node?{x:node.x,y:node.y}:{x:camera.x,y:camera.y},
    vertex, item, node, venue:!!target.closest('[data-venue]'),
    first:target.dataset.drawPoint==='0', moved:false
  };
  gestureBefore=null;
  edited=false;
  if (node && !draw) {
    selection=fixture?item:'venue';
    render();
    properties();
  }
});
svg.addEventListener('pointermove',event=>{
  const point=localPoint(event);
  const pos=world(point);
  $('coordinate').textContent='X '+Math.round(pos.x)+' · Y '+Math.round(pos.y)+' mm';
  if (!pointers.has(event.pointerId)) return;
  pointers.set(event.pointerId,point);
  if (pointers.size===2) {
    const {mid,distance}=pair();
    setZoom(gesture.anchor,mid,gesture.scale*distance/gesture.distance);
  } else {
    const g=gesture;
    if (!g.moved && Math.hypot(point.x-g.point.x,point.y-g.point.y)<4) return;
    g.moved=true;
    if (g.kind==='move') {
      const x=snap(g.origin.x+pos.x-g.start.x), y=snap(g.origin.y+pos.y-g.start.y);
      if (x===g.node.x && y===g.node.y) return;
      if (!gestureBefore) gestureBefore=clone(state);
      Object.assign(g.node,{x,y});
      edited=true;
    } else {
      camera.x=g.origin.x-(point.x-g.point.x)/camera.scale;
      camera.y=g.origin.y-(point.y-g.point.y)/camera.scale;
    }
  }
  render();
});
function closeDraw(){
  if (!draw || !validPolygon(draw.points)) return toast('至少需要 3 个顶点，边线不能交叉');
  const {name,points}=draw;
  draw=null;
  addPlan(name,points,'polygon');
}
function endPointer(event){
  if (!pointers.has(event.pointerId)) return;
  pointers.delete(event.pointerId);
  if (pointers.size) {
    const [point]=pointers.values();
    gesture={kind:'pan',point,origin:{x:camera.x,y:camera.y},moved:true};
    return;
  }
  const g=gesture;
  gesture=null;
  if (edited) {
    if (event.type!=='pointerup') {
      state=gestureBefore;
    } else if (!validPolygon(plan().points)) {
      state=gestureBefore;
      toast('顶点调整会使边线重叠或交叉');
    } else {
      const b=normalize(plan().points,plan().fixtures);
      camera.x-=b.left;
      camera.y-=b.top;
      remember(gestureBefore);
    }
    refresh();
  } else if (!g.moved && event.type==='pointerup') {
    if (draw) {
      if (g.first && draw.points.length>=3) return closeDraw();
      if (draw.points.length>=500) return toast('最多可添加 500 个顶点');
      const point={x:snap(g.start.x),y:snap(g.start.y)};
      if (!draw.points.some(p=>p.x===point.x && p.y===point.y)) draw.points.push(point);
    } else if (g.kind==='pan') {
      selection=g.venue?'venue':null;
      properties();
    }
    render();
  }
}
['pointerup','pointercancel','lostpointercapture'].forEach(type=>svg.addEventListener(type,endPointer));
svg.addEventListener('wheel',event=>{
  event.preventDefault();
  if (!pointers.size) zoomAt(localPoint(event),Math.exp(-Math.max(-130,Math.min(130,event.deltaY))*.0025));
},{passive:false});
function centerZoom(factor){
  if (!pointers.size) zoomAt({x:svg.clientWidth/2,y:svg.clientHeight/2},factor);
}
function download(blob,name){
  const url=URL.createObjectURL(blob);
  const link=document.createElement('a');
  link.href=url;
  link.download=name;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(()=>URL.revokeObjectURL(url),30000);
}
function jsonDownload(value,name){
  download(new Blob([JSON.stringify(value,null,2)],{type:'application/json'}),name+'.json');
}
function png(){
  const p=plan(), b=contentBounds(p), w=Math.max(b.right-b.left,.001),h=Math.max(b.bottom-b.top,.001);
  const u=Math.max(w/1480,h/1460);
  const view=[b.left-110*u,b.top-125*u,w+220*u,h+225*u];
  const [x,y,width,height]=view;
  // Leave room for rounding and keep well within 4096px canvas dimensions.
  const longestSide=Math.max(1600,Math.min(3000,4096));
  const scale=longestSide/Math.max(width,height);
  const outputWidth=Math.round(width*scale),outputHeight=Math.round(height*scale);
  const titleSize=fitText(p.name,w+85*u,31*u,700);
  const markup='<svg xmlns="http://www.w3.org/2000/svg" width="'+outputWidth+'" height="'+outputHeight+'" viewBox="'+view.join(' ')+'" font-family="'+svgFont+'">'+
    '<rect x="'+x+'" y="'+y+'" width="'+width+'" height="'+height+'" fill="#fff"/>'+
    '<text x="'+b.left+'" y="'+(b.top-62*u)+'" font-size="'+titleSize+'" fill="#192944" font-weight="700">'+esc(p.name)+'</text>'+
    planMarkup(p,u,true)+scaleMark(b.left,b.bottom+63*u,u)+'</svg>';
  const url=URL.createObjectURL(new Blob([markup],{type:'image/svg+xml;charset=utf-8'}));
  const image=new Image();
  image.onload=()=>{
    try {
      const canvas=document.createElement('canvas');
      canvas.width=outputWidth;
      canvas.height=outputHeight;
      const context=canvas.getContext('2d');
      context.fillStyle='#fff';
      context.fillRect(0,0,outputWidth,outputHeight);
      context.drawImage(image,0,0);
      canvas.toBlob(blob=>{
        if (blob) download(blob,p.name+'.png');
        else toast('PNG 导出失败');
      },'image/png');
    } catch {
      toast('PNG 导出失败');
    } finally {
      URL.revokeObjectURL(url);
    }
  };
  image.onerror=()=>{URL.revokeObjectURL(url);toast('PNG 导出失败');};
  image.src=url;
}
function exportMenu(){
  if (draw) return toast('请先完成或取消当前绘制');
  modal('导出当前方案','<div class="modal-body"><p class="hint">PNG 适合分享和打印。JSON 包含方案及货架库，可再次导入编辑。</p></div>',
    foot('<button id="json-export" data-testid="btn-export-json" class="outline">'+icon('download')+'导出 JSON</button><button id="png-export" data-testid="btn-export-png" class="primary">'+icon('download')+'导出 PNG</button>'));
  $('json-export').onclick=()=>{
    jsonDownload({version:1,plan:plan(),library:state.library},plan().name);
    dialog.close();
  };
  $('png-export').onclick=()=>{dialog.close();png();};
}
function finite(value,min=-1e9,max=1e9){
  if ((typeof value!=='number' && typeof value!=='string') || String(value).trim()==='') throw Error();
  const n=Number(value);
  if (!Number.isFinite(n) || n<min || n>max) throw Error();
  return n;
}
function cleanName(value){
  if (typeof value!=='string' || !value.trim() || value.trim().length>100) throw Error();
  return value.trim();
}
function cleanType(type){
  let color=typeof type.color==='string'?type.color.trim().toLowerCase():'';
  if (/^#[\da-f]{3}$/.test(color)) color='#'+[...color.slice(1)].map(c=>c+c).join('');
  if (!/^#[\da-f]{6}$/.test(color)) throw Error();
  return {id:uid(),name:cleanName(type.name),width:finite(type.width,.001),depth:finite(type.depth,.001),color};
}
function cleanLibrary(entries){
  if (!Array.isArray(entries)) throw Error();
  return entries.map(entry=>{
    if (!Object.hasOwn(entry,'members')) return cleanType(entry);
    if (!Array.isArray(entry.members) || entry.members.length<2) throw Error();
    const members=entry.members.map(member=>{
      const {name,width,depth,color}=cleanType(member);
      return {name,width,depth,color,offsetX:finite(member.offsetX),offsetY:finite(member.offsetY)};
    });
    return {id:uid(),name:cleanName(entry.name),members};
  });
}
function sameLibraryEntry(a,b){
  const sameRectangle=(left,right)=>['name','width','depth','color'].every(key=>left[key]===right[key]);
  if (!a.members && !b.members) return sameRectangle(a,b);
  return a.name===b.name && a.members && b.members && a.members.length===b.members.length &&
    a.members.every((member,index)=>{
      const other=b.members[index];
      return sameRectangle(member,other) && member.offsetX===other.offsetX && member.offsetY===other.offsetY;
    });
}
function mergeLibrary(entries){
  for (const entry of entries) {
    if (!state.library.some(type=>sameLibraryEntry(type,entry))) state.library.push(entry);
  }
}
function cleanPlan(entry){
  if (!Array.isArray(entry.points) || !Array.isArray(entry.fixtures)) throw Error();
  let points=entry.points.map(p=>({x:finite(p.x),y:finite(p.y)}));
  if (!validPolygon(points)) throw Error();
  const b=bounds(points);
  const rect=rectangle(b.right-b.left,b.bottom-b.top);
  const kind=entry.kind==='rect' && points.length===4 && rect.every(c=>points.some(p=>c.x+b.left===p.x && c.y+b.top===p.y))?'rect':'polygon';
  if (kind==='rect') points=rect.map(p=>({x:p.x+b.left,y:p.y+b.top}));
  const p=createPlan(cleanName(entry.name),points,kind);
  p.fixtures=entry.fixtures.map(f=>({...cleanType(f),x:finite(f.x),y:finite(f.y),rotation:finite(f.rotation??0)%360}));
  normalize(points,p.fixtures);
  p.grid=entry.grid!==false;
  p.snap=entry.snap!==false;
  if ([10,50,100,500].includes(entry.step)) p.step=entry.step;
  return p;
}
function parseCSV(text){
  const rows=[];
  let row=[],value='',quoted=false;
  for (let i=0;i<text.length;i++) {
    const c=text[i];
    if (quoted) {
      if(c==='"' && text[i+1]==='"') {value+='"';i++;}
      else if(c==='"') quoted=false;
      else value+=c;
    } else if(c==='"' && !value) quoted=true;
    else if(c===',') {row.push(value);value='';}
    else if(c==='\r'||c==='\n') {
      if(c==='\r' && text[i+1]==='\n') i++;
      row.push(value);
      rows.push(row);
      row=[];
      value='';
    } else value+=c;
  }
  if (quoted) throw Error();
  row.push(value);
  rows.push(row);
  const headers=rows.shift().map(name=>name.trim().toLowerCase());
  if (!['name','width','depth','color'].every(name=>headers.includes(name))) throw Error();
  return rows.filter(cells=>cells.some(value=>value.trim())).map(cells=>Object.fromEntries(headers.map((key,i)=>[key,cells[i]])));
}
async function readFile(input,libraryOnly){
  const file=input.files[0];
  input.value='';
  if (!file) return;
  try {
    const text=(await file.text()).replace(/^\uFEFF/,'');
    if (draw) return toast('请先完成或取消当前绘制');
    if (libraryOnly) {
      const value=/\.csv$/i.test(file.name)?parseCSV(text):JSON.parse(text);
      const entries=cleanLibrary(value.library??value);
      change(()=>mergeLibrary(entries));
      toast('货架库已导入');
    } else {
      const value=JSON.parse(text);
      const imported=cleanPlan(value.plan??value);
      const entries=cleanLibrary(value.library??[]);
      change(()=>{mergeLibrary(entries);state.plans.push(imported);activate(imported);},true);
      toast('方案已导入');
    }
  } catch {
    toast(libraryOnly?'货架库格式无效，请检查名称、尺寸和颜色':'方案文件格式无效');
  }
}
$('new-btn').onclick=newVenue;
$('plans-btn').onclick=planList;
$('export-btn').onclick=exportMenu;
$('import-btn').onclick=()=>draw?toast('请先完成或取消当前绘制'):$('plan-file').click();
$('plan-file').onchange=()=>readFile($('plan-file'),false);
$('import-library').onclick=()=>$('library-file').click();
$('library-file').onchange=()=>readFile($('library-file'),true);
$('export-library').onclick=()=>jsonDownload(state.library,'卖场货架库');
$('add-type').onclick=()=>typeEditor();
$('add-group').onclick=()=>groupEditor();
$('restore-library').onclick=()=>{
  if (!confirm('恢复缺少的默认货架？')) return;
  const missing=defaultLibrary().filter(entry=>!state.library.some(type=>
    type.id===entry.id || sameLibraryEntry(type,entry)));
  if (!missing.length) return toast('默认货架已齐全');
  change(()=>state.library.push(...missing));
  toast('已恢复 '+missing.length+' 项默认货架');
};
$('library-list').onclick=event=>{
  const button=event.target.closest('button');
  if (!button) return;
  const {place:placeId,edit,delete:remove}=button.dataset;
  if (placeId) return place(placeId);
  const type=state.library.find(entry=>entry.id===(edit??remove));
  if (!type) return;
  if (remove) deleteType(type);
  else if (type.members) groupEditor(type);
  else typeEditor(type);
};
$('library-btn').onclick=()=>{
  const panel=$('library-panel');
  panel.classList.toggle('open');
  $('properties').classList.remove('open');
  if (matchMedia('(min-width:701px)').matches) $('add-type').focus();
};
$('selection-bar').onclick=event=>{
  const f=selectedFixture();
  const action=event.target.closest('[data-action]')?.dataset.action;
  if (!f || !action || pointers.size) return;
  if (action==='properties') {
    $('library-panel').classList.remove('open');
    $('properties').classList.add('open');
    $('placed-name').focus();
  } else if (action==='rotate') change(()=>f.rotation=(f.rotation+90)%360);
  else if (action==='duplicate') change(()=>{
    const offset=plan().snap?plan().step:Math.max(f.width,f.depth)*.15;
    const copy=fixture(f,f.x+offset,f.y+offset,f.rotation);
    plan().fixtures.push(copy);
    selection=copy.id;
  });
  else if (action==='delete') change(()=>{
    plan().fixtures=plan().fixtures.filter(item=>item.id!==f.id);
    selection=null;
    $('properties').classList.remove('open');
  });
};
$('grid-btn').onclick=()=>change(()=>plan().grid=!plan().grid);
$('snap-btn').onclick=()=>change(()=>plan().snap=!plan().snap);
$('snap-size').onchange=event=>change(()=>plan().step=Number(event.target.value));
$('undo').onclick=()=>history(past,future);
$('redo').onclick=()=>history(future,past);
$('fit').onclick=()=>{if (!pointers.size) fitView();};
$('zoom-in').onclick=()=>centerZoom(1.25);
$('zoom-out').onclick=()=>centerZoom(.8);
$('draw-back').onclick=()=>{if (draw) {draw.points.pop();render();}};
$('draw-close').onclick=closeDraw;
$('draw-cancel').onclick=()=>{
  if (!draw) return;
  Object.assign(camera,draw.savedCamera);
  draw=null;
  refresh();
};
document.addEventListener('keydown',event=>{
  if (dialog.open || event.target.matches('input,select,textarea')) return;
  if ((event.ctrlKey || event.metaKey) && ['z','y'].includes(event.key.toLowerCase())) {
    event.preventDefault();
    if (event.shiftKey || event.key.toLowerCase()==='y') history(future,past);
    else history(past,future);
  }
});
let lastSize='';
new ResizeObserver(()=>{
  const size=svg.clientWidth+'x'+svg.clientHeight;
  if (size!==lastSize) {
    lastSize=size;
    fitView();
  }
}).observe(svg);
save();
refresh();
fitView();
