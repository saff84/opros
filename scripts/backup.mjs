import {DatabaseSync,backup} from 'node:sqlite';import {mkdirSync} from 'node:fs';import {dirname,resolve} from 'node:path';
const source=process.env.DATABASE_PATH||'/data/survey.sqlite';const target=resolve(process.argv[2]||('/data/backups/survey-'+new Date().toISOString().replace(/[:.]/g,'-')+'.sqlite'));
if(resolve(source)===target)throw Error('Backup target must differ from database');mkdirSync(dirname(target),{recursive:true});const db=new DatabaseSync(source,{readOnly:true});await backup(db,target);db.close();console.log(target);
