/* Embedded context is granted by the platform, never by URL project names. */
const embedded=new URLSearchParams(location.search).get('embed')==='1';
const dashboardContext=embedded&&parent!==window?parent.SeeTimeDashboardHost?.context(window):null;
if(embedded){document.body.classList.add('platform-embedded');if(!dashboardContext){document.body.replaceChildren();throw new Error('Project dashboard access denied')}}
