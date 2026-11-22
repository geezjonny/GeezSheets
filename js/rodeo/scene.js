export const blankScene=(name='New scene')=>({name,map:null,grid:{on:true,color:'#fff',opacity:.18},ftPerCell:5,tokens:{},drawings:{},fog:{}});
export const snapPoint=(x,y,size=1,on=true)=>on?{x:Math.round(x-size/2)+size/2,y:Math.round(y-size/2)+size/2}:{x,y};
export const fogShapesOrdered=f=>Object.values(f||{}).sort((a,b)=>(a.order||0)-(b.order||0));
