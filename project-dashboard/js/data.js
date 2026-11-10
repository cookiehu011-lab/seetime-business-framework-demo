/* Deterministic, isolated fixture. No platform data or storage dependencies. */
const DemoData = (() => {
  const names = ['庆春路口','延安路北段','东站广场','湖滨步行街','武林广场','钱江新城','凤起路','运河文化广场'];
  const cameras = Array.from({length:120}, (_,i) => {
    const gov = i%10 < 7 ? '已治理' : i%10 < 9 ? '待治理' : '无需治理';
    const personalValue = ['有价值','有价值','有价值','无价值','待评估'][i%5];
    const governanceValue = ['有价值','无价值','有价值','待评估','有价值','无价值','有价值'][i%7];
    const basicInfoUsable = i%16 !== 0;
    const mounted = gov==='已治理' && personalValue==='有价值' && basicInfoUsable && i%7!==0;
    const configured = gov==='已治理' && governanceValue==='有价值' && basicInfoUsable && i%5!==0;
    const personal = mounted;
    const governance = configured;
    const online = i%13 === 0 ? '离线' : i%19 === 0 ? '未知' : '在线';
    const issues = [];
    if(online === '离线') issues.push('离线');
    if(i%17 === 0) issues.push('拉流异常');
    if(i%11 === 0) issues.push('画面异常');
    if(i%23 === 0) issues.push('截帧超时');
    if(i%29 === 0) issues.push('转动待核验');
    if(i%31 === 0) issues.push('串流待核验');
    return {id:`HZ-${String(i+1).padStart(4,'0')}`, index:i, name:`${names[i%8]} · ${['东向','西向','南向','北向'][Math.floor(i/8)%4]} ${Math.floor(i/32)+1}号`, source:i%3?'城市视频平台':'社会接入', batch:i%3? (i%2?'一期接入':'二期接入'):'共建批次', gov, method:i%2?'人工':'AI', personalValue,governanceValue,personal,governance,online,issues, basicInfoUsable, mounted, configured, poi:names[i%8], duration:2+i%38};
  });
  return {cameras,snapshot:'2026-11-09T10:40:00+08:00', batches:{'城市视频平台':['一期接入','二期接入'],'社会接入':['共建批次']}};
})();
