import type { MenuOption } from "../menu";
export type PackChoice={option:MenuOption;presentation:string;pieces:number};
export const toPackChoice=(option:MenuOption):PackChoice=>{
 const size=option.size.trim();
 const box=/^(6|12)\s+(mini|individual(?:es)?|pieces|piezas)(?:\b|\s|·)/i.exec(size);
 if(box)return {option,pieces:Number(box[1]),presentation:/^mini/i.test(box[2]!)?"mini":/^individ/i.test(box[2]!)?"individual":"piece"};
 return {option,pieces:1,presentation:/^mini(?:\b|\s|·)/i.test(size)?"mini":/^individual(?:\b|\s|·)/i.test(size)?"individual":size};
};
export const packChoices=(options:MenuOption[])=>{
 const choices=options.map(toPackChoice);
 const quantities=[...new Set(choices.map(c=>c.pieces))].sort((a,b)=>a-b);
 if(!quantities.includes(6)&&!quantities.includes(12))return null;
 const presentations=[...new Set(choices.map(c=>c.presentation))];
 if(new Set(choices.map(c=>c.presentation+"|"+c.pieces)).size!==choices.length)return null;
 return {choices,presentations,quantities};
};
export const packQtyLabel=(n:number,lang:"en"|"es"|"ar")=>n===6?({en:"Half dozen",es:"Media docena",ar:"نصف دزينة"})[lang]:n===12?({en:"Dozen",es:"Docena",ar:"دزينة"})[lang]:({en:"Single",es:"Por pieza",ar:"بالقطعة"})[lang];
export const presentationLabel=(s:string,lang:"en"|"es"|"ar")=>s==="mini"?({en:"Mini",es:"Mini",ar:"ميني"})[lang]:s==="individual"?({en:"Individual",es:"Individual",ar:"فردي"})[lang]:s==="piece"?({en:"Pieces",es:"Piezas",ar:"قطع"})[lang]:s;
