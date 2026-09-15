import {createContext,useContext} from 'react';
export type ConsoleSession={user:{id:string;name:string;email:string};organization?:{id:string;name:string};isPlatformAdmin:boolean;adminRole?:'OWNER'|'ADMIN'|'VIEWER'};
export const ConsoleContext=createContext<{session:ConsoleSession;refresh:()=>Promise<void>}>({} as never);
export const useConsole=()=>useContext(ConsoleContext);
export const useCanManage=()=>['OWNER','ADMIN'].includes(useConsole().session.adminRole||'VIEWER');
