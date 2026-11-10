/* Definitions match metrics.js. Tooltips never change business state. */
const MetricHelp = (() => {
  const descriptions = {
    rate:'成功请求数 ÷ 已结束请求数；缺失时段不计入。',
 requests:'所选周期内实际发起且已结束的拉流请求。',
 missed:'按计划应执行但未发起的采集次数，不计入实际请求。',
 taskRate:'成功任务数 ÷ 已结束任务数，不含进行中任务。',
 all:'当前项目已接入的相机，按相机 ID 去重。',
    governed:'已完成治理的相机。转化率 = 已治理 ÷ 已接入。',
    pending:'有效治理状态为待治理的相机。',
    unneeded:'无需治理的相机，不计入已治理漏斗。',
    review:'已完成治理且至少一版有价值，存在基础信息错误反馈、转动待核验或串流待核验的相机；多项原因按相机去重。',
    impact:'已订阅应用且有异常待排查的相机；多项异常只计 1 台。',
    mountPending:'已治理、基本信息可用、个人版有价值，但尚未挂载的相机。',
    configPending:'已治理、基本信息可用、治理版有价值，但尚未完成检测配置的相机。',
    bothNo:'已治理且对两版均无价值的相机，与单版无价值数不相加。',
    personalOnly:'仅订阅个人版、未订阅治理版的相机。',
    governanceOnly:'仅订阅治理版、未订阅个人版的相机。',
    both:'同时订阅个人版和治理版的相机，每台只计一次。',
    neither:'两个应用均未订阅的相机。未订阅不代表无价值。',
    online:'连接在线的相机，不代表画面或应用正常。',
    offline:'当前连接状态明确为离线的相机，不含未知状态。',
    unknown:'尚未获得有效连接状态的相机，不归为在线或离线。',
    stream:'拉流异常且尚未恢复的相机，不含无请求情况。',
    quality:'当前画面检测结果异常的相机，可与离线、拉流异常重复。',
    stale:'未按采集计划及时更新截帧的相机。',
    rotation:'检测到可能转动、尚待核验的相机。',
    mounted:'个人版已确认 POI 挂载的相机。挂载多个 POI 仍只计 1 台。',
    configured:'已订阅治理版并启用检测的相机。',
    personal:'完成治理、个人版有价值且挂载成功后开始订阅的相机。',
    governance:'完成治理、治理版有价值且配置完成后开始订阅的相机。'
  };
  for (const [key,label] of [['personal','个人版'],['governance','治理版']]) {
    descriptions[key+'Value']=`已治理且对${label}有价值的相机；占比以已治理数为分母。`;
    descriptions[key+'Funnel']=`已治理、有价值且已订阅${label}的相机；占比以该版有价值数为分母。`;
    descriptions[key+'No']=`已治理范围内，明确判定对${label}无价值的相机。不包含待评估。`;
    descriptions[key+'Unknown']=`已治理范围内，尚未形成${label}有效价值结论的相机。`;
    descriptions[key+'Gap']=`已治理且对${label}有价值，但未订阅该应用的相机。`;
    descriptions[key+'Outside']=`已订阅${label}，但未满足已治理、有价值及挂载成功或配置完成条件的相机。`;
    const ready=key==='personal'?'已挂载':'已启用检测';
    descriptions[key+'Running']=`${ready}、在线且无当前异常的相机（模拟运行口径）。`;
    descriptions[key+'Abnormal']=`${label}${ready}且存在当前异常的相机，多项异常按相机去重。`;
    descriptions[key+'UnknownRun']=`${ready}且无明确异常，但连接状态未知的相机。`;
  }
  const tip=()=>document.getElementById('metric-tooltip');let active=null;
  function hide(){if(active)active.removeAttribute('aria-describedby');active=null;if(tip())tip().hidden=true;}
  function show(el,event){
    const content=descriptions[el.dataset.group||el.dataset.help];if(!content)return;
    hide();active=el;el.setAttribute('aria-describedby','metric-tooltip');
    tip().textContent=content;
    tip().hidden=false;
    const anchor=el.querySelector('.help-icon')||el;
    const r=anchor.getBoundingClientRect(),t=tip().getBoundingClientRect();
    const x=event?event.clientX:r.left+r.width/2,y=event?event.clientY:r.top;
    tip().style.left=Math.max(10,Math.min(x-t.width/2,innerWidth-t.width-10))+'px';
    tip().style.top=Math.max(8,y-t.height-12)+'px';
  }
  function bind(){document.querySelectorAll('[data-group],[data-help]').forEach(el=>{
    const trigger=el.querySelector('.help-icon')?.parentElement||el;
    trigger.addEventListener('mouseenter',event=>show(el,event));
    trigger.addEventListener('mousemove',event=>show(el,event));trigger.addEventListener('mouseleave',hide);
    el.addEventListener('focus',()=>show(el));el.addEventListener('blur',hide);el.addEventListener('click',hide);
  });}
  document.addEventListener('keydown',e=>{if(e.key==='Escape')hide();});
  document.addEventListener('scroll',hide,true);window.addEventListener('resize',hide);
  return {bind,hide};
})();
