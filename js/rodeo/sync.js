let offline=true, room='table', state={};
export const isOffline=()=>offline;
export function initSync(r){room=r;try{localStorage.setItem('rodeo-last-room',r);}catch{}}
export const setValue=async(p,v)=>{state[`${room}/${p}`]=v;return v}; export const updateValue=setValue; export const removeValue=async p=>delete state[`${room}/${p}`];
export const chat=e=>setValue('chat/'+Date.now(),e); export const setToken=(id,p)=>updateValue('scene/tokens/'+id,p); export const removeToken=id=>removeValue('scene/tokens/'+id);
