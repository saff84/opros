import {env} from "../../runtime";import {json,isAdmin} from "../../security";
export async function GET(req:Request){if(!await isAdmin(req))return json({error:"Требуется вход"},401);const data=await env.DB!.prepare("SELECT * FROM responses ORDER BY updated DESC").all();return json({rows:data.results.map((r:any)=>({...r,answers:JSON.parse(r.answers)}))})}
