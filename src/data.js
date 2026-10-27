// Fictional, opt-in fixtures. API-shaped identity is separate from app-owned matching data.
const rows = [
 ['Aya Bennis','abennis',8.42,'ft_transcendence','Evening','Tetouan',true,'#b9b0e9','Backend brain. Frontend sympathizer. Will bring snacks and actually read your PR.', ['TypeScript','Docker','NestJS'],212,3],
 ['Yassine Amrani','yamrani',7.16,'ft_transcendence','Evening','Tetouan',false,'#f0b48d','Looking for a team that communicates more than its microservices.', ['React','C++','WebGL'],168,3],
 ['Lina Idrissi','lidrissi',12.08,'ft_transcendence','Morning','Tetouan',true,'#bad8b3','Shipped it. Broke it. Shipped it again. Happy to help you get unstuck.', ['DevOps','Docker','Security'],195,5],
 ['Adam Tazi','atazi',5.68,'minishell','Evening','Tetouan',true,'#f1cd7a','I handle the pipes. You handle the existential dread. Let’s build a shell.', ['C','Unix','Debugging'],230,2],
 ['Salma Naji','snaji',9.14,'ft_transcendence','Morning','Khouribga',false,'#afcdd9','Clean interfaces, questionable sleep schedule. Here for the long sprint.', ['React','Design','TypeScript'],180,4],
 ['Omar Alami','oalami',6.32,'cub3d','Evening','Tetouan',true,'#d3c29d','Raycasting by day, debugging by night. No ghosting, only segfaults.', ['C','Graphics','Math'],204,3],
 ['Nour Fassi','nfassi',10.6,'minishell','Morning','Tetouan',false,'#d5b6ce','Your friendly neighborhood rubber duck. Let’s make the hard parts make sense.', ['C','Unix','Mentoring'],156,4],
 ['Ilyas Rami','irami',8.87,'ft_transcendence','Evening','Tetouan',true,'#b7d5c1','Looking for one more person. Git commits are my love language.', ['Node.js','Postgres','Docker'],221,3]
];
export const profiles=rows.map((r,i)=>({
 id:90001+i,login:r[1],displayname:r[0],image:{link:null},campus:[{id:r[5]==='Tetouan'?55:16,name:r[5]}],
 cursus_users:[{cursus_id:21,level:r[2],skills:r[9].map((name,id)=>({id,name,level:5+id}))}],
 projects_users:[{id:800+i,project:{id:i+100,name:r[3],slug:r[3]},status:i===2||i===6?'finished':'in_progress','validated?':i===2||i===6,final_mark:i===2||i===6?100:null}],
 app:{optedIn:true,teamless:true,schedule:r[4],likesYou:r[6],color:r[7],bio:r[8],hours:r[10],circle:r[11],endorsements:{'Clear communicator':8+i,'Reliable teammate':5+i,'Great explainer':3+i}}
}));
export const initialState={decisions:[],endorsements:{},messages:{},optedIn:true};
export function loadState(){try{const s=JSON.parse(localStorage.getItem('peer-demo-v1'));if(!s)return initialState;return {decisions:Array.isArray(s.decisions)?s.decisions.filter(d=>profiles.some(p=>p.id===d.id)&&['merge','pass'].includes(d.action)).filter((d,i,a)=>a.findIndex(x=>x.id===d.id)===i):[],endorsements:s.endorsements&&typeof s.endorsements==='object'?s.endorsements:{},messages:s.messages&&typeof s.messages==='object'?s.messages:{},optedIn:s.optedIn!==false}}catch{return initialState}}
export function isMatch(p,decisions){return p.app.likesYou&&decisions.some(d=>d.id===p.id&&d.action==='merge')}
export function candidates(filters,decisions){return profiles.filter(p=>p.app.optedIn&&!decisions.some(d=>d.id===p.id)&&(filters.campus==='All campuses'||p.campus[0].name===filters.campus)&&(filters.project==='Any project'||p.projects_users[0].project.name===filters.project)&&(filters.schedule==='Any time'||p.app.schedule===filters.schedule)&&(filters.mode==='Guidance'?p.projects_users[0]['validated?']:filters.mode==='Team rescue'?!p.projects_users[0]['validated?']&&p.app.teamless:true))}
