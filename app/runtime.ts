import {DatabaseSync} from 'node:sqlite';
import {mkdirSync} from 'node:fs';
import {dirname,resolve} from 'node:path';
let database:DatabaseSync|undefined;
function getDatabase(){if(!database){const filename=resolve(process.env.DATABASE_PATH||'data/survey.sqlite');mkdirSync(dirname(filename),{recursive:true});database=new DatabaseSync(filename);database.exec('PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000; CREATE TABLE IF NOT EXISTS responses (id TEXT PRIMARY KEY NOT NULL, created TEXT NOT NULL, updated TEXT NOT NULL, status TEXT NOT NULL, name TEXT NOT NULL, answers TEXT NOT NULL);')}return database}
export const env={get ADMIN_PASSWORD(){return process.env.ADMIN_PASSWORD},DB:{prepare(sql:string){let values:any[]=[];return {bind(...parameters:any[]){values=parameters;return this},async first(){return getDatabase().prepare(sql).get(...values)||null},async all(){return {results:getDatabase().prepare(sql).all(...values)}},async run(){return getDatabase().prepare(sql).run(...values)}}}}};
