// Keep exact server positions when a highlighted card is already outside page one.
export function sortRadarCards<T extends {id:string;stage:string;boardPosition?:string}>(cards:T[]):T[]{
 const groups=new Map<string,T[]>();
 for(const card of cards){const group=groups.get(card.stage)??[];group.push(card);groups.set(card.stage,group);}
 return [...groups.values()].flatMap(group=>group.sort((left,right)=>{
  if(!left.boardPosition||!right.boardPosition||! /^-?\d+$/.test(left.boardPosition)||! /^-?\d+$/.test(right.boardPosition))return 0;
  const a=BigInt(left.boardPosition),b=BigInt(right.boardPosition);
  return a<b?-1:a>b?1:left.id<right.id?-1:left.id>right.id?1:0;
 }));
}
