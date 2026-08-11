const API = "https://graphql.anilist.co";

const categories = [
  {name:"Isekai", type:"tag", value:"Isekai", desc:"Autre monde, aventure", query:"Isekai"},
  {name:"Shonen", type:"tag", value:"Shounen", desc:"Combats & rivalités", query:"Shonen"},
  {name:"Seinen", type:"tag", value:"Seinen", desc:"Plus mature, plus intense", query:"Seinen"},
  {name:"Romance", type:"genre", value:"Romance", desc:"Amour & émotions", query:"Romance"},
  {name:"Horreur", type:"genre", value:"Horror", desc:"Frissons garantis", query:"Horreur"},
  {name:"Slice of Life", type:"genre", value:"Slice of Life", desc:"Moments du quotidien", query:"Slice of Life"},
  {name:"Action", type:"genre", value:"Action", desc:"Énergie & combats", query:"Action"},
  {name:"Comédie", type:"genre", value:"Comedy", desc:"Pour rigoler", query:"Comédie"}
];

const vfMap = {
  // Mapping volontairement limité au MVP. À maintenir manuellement car AniList
  // ne garantit pas les doublages français ni les plateformes françaises.
  "Naruto": {vf:true, platform:"À vérifier"},
  "One Piece": {vf:true, platform:"À vérifier"},
  "Demon Slayer": {vf:true, platform:"À vérifier"},
  "Jujutsu Kaisen": {vf:true, platform:"À vérifier"},
  "My Hero Academia": {vf:true, platform:"À vérifier"},
  "Attack on Titan": {vf:true, platform:"À vérifier"}
};

const state = {category:null, rawAnime:[], chatBusy:false};

async function anilist(query, variables={}) {
  const res = await fetch(API, {
    method:"POST",
    headers:{"Content-Type":"application/json","Accept":"application/json"},
    body:JSON.stringify({query, variables})
  });
  const json = await res.json();
  if (!res.ok || json.errors) throw new Error(json.errors?.[0]?.message || "Erreur AniList");
  return json.data;
}

const animeFields = `
  id
  title { romaji english native }
  coverImage { large extraLarge color }
  bannerImage
  description(asHtml:false)
  averageScore
  meanScore
  popularity
  episodes
  status
  format
  seasonYear
  genres
  tags { name rank }
  countryOfOrigin
  studios(isMain:true) { nodes { name } }
  externalLinks { site url type }
`;

async function getCategory(cat, page=1) {
  const filterArg = cat.type === "genre" ? "genre:$filter" : "tag:$filter";
  const query = `query($page:Int,$perPage:Int,$filter:String){
    Page(page:$page,perPage:$perPage){
      pageInfo{hasNextPage currentPage}
      media(type:ANIME, ${filterArg}, sort:[POPULARITY_DESC]){${animeFields}}
    }
  }`;
  const data = await anilist(query,{page,perPage:20,filter:cat.value});
  return data.Page.media;
}

async function searchAnime(search, page=1) {
  const query = `query($page:Int,$perPage:Int,$search:String){
    Page(page:$page,perPage:$perPage){
      pageInfo{hasNextPage}
      media(type:ANIME,search:$search,sort:[SEARCH_MATCH,POPULARITY_DESC]){${animeFields}}
    }
  }`;
  const data = await anilist(query,{page,perPage:20,search});
  return data.Page.media;
}

function esc(s=""){return String(s).replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[m]));}
function titleOf(a){return a.title?.english || a.title?.romaji || a.title?.native || "Titre inconnu";}
function cleanDescription(s=""){return s.replace
(/<[^>]+>/g,"").replace(/\s+/g," ").trim();}
async function translateToFrench(text) {
  if (!text) return "Synopsis non disponible.";

  const clean = text.replace(/\s+/g, " ").trim();
  const chunks = clean.match(/.{1,450}(?:\s|$)/g) || [clean];

  try {
    const translated = [];

    for (const chunk of chunks) {
      const url =
        "https://api.mymemory.translated.net/get?q=" +
        encodeURIComponent(chunk) +
        "&langpair=en|fr";

      const response = await fetch(url);
      const data = await response.json();

      translated.push(
        data.responseData?.translatedText || chunk
      );
    }

    return translated.join(" ");
  } catch (error) {
    console.error("Erreur traduction :", error);
    return clean;
  }
}
function availability(a){
  const t = titleOf(a);
  const found = Object.keys(vfMap).find(k=>t.toLowerCase().includes(k.toLowerCase()) || (a.title?.romaji||"").toLowerCase().includes(k.toLowerCase()));
  return found ? {vf:true,vostfr:true,platform:vfMap[found].platform} : {vf:false,vostfr:true,platform:"À vérifier sur la plateforme"};
}

function card(a){
  const av=availability(a);
  const img=a.coverImage?.extraLarge||a.coverImage?.large||"";
  const score=a.averageScore?`${(a.averageScore/10).toFixed(1)}`:"—";
  return `<article class="anime-card" data-id="${a.id}">
    <div class="cover-wrap"><img loading="lazy" src="${esc(img)}" alt="${esc(titleOf(a))}"><span class="score">★ ${score}</span></div>
    <div class="anime-info">
      <h3 title="${esc(titleOf(a))}">${esc(titleOf(a))}</h3>
      <div class="meta"><span>${a.seasonYear||"—"}</span><span>•</span><span>${a.episodes||"?"} ép.</span><span>•</span><span>${esc(a.format||"—")}</span></div>
      <div class="badges">${av.vf?'<span class="badge vf">VF disponible</span>':""}<span class="badge vostfr">VOSTFR</span></div>
    </div>
  </article>`;
}

function renderCategories(){
  const grid=document.querySelector("#category-grid");
  grid.innerHTML=categories.map((c,i)=>`<button class="category" data-cat="${i}">
    <img loading="lazy" src="https://images.unsplash.com/photo-1578632767115-351597cf2477?auto=format&fit=crop&w=900&q=80&sig=${i+1}" alt="">
    <div class="category-content"><h3>${esc(c.name)}</h3><p>${esc(c.desc)}</p></div>
  </button>`).join("");
  // Images above are decorative only; anime covers are fetched from AniList in results.
}

async function openCategory(cat){
  state.category=cat;
  document.querySelector("#results").classList.remove("hidden");
  document.querySelector("#results-title").textContent=cat.name;
  document.querySelector("#results-kicker").textContent=`${cat.name.toUpperCase()} · ANILIST`;
  document.querySelector("#results").scrollIntoView({behavior:"smooth"});
  await loadResults();
}

async function loadResults(){
  const status=document.querySelector("#results-status"), grid=document.querySelector("#anime-grid");
  status.textContent="Chargement des animes…"; grid.innerHTML="";
  try{
    const list=await getCategory(state.category);
    state.rawAnime=list;
    applyFilters();
  }catch(e){
    status.textContent="Impossible de charger AniList pour le moment.";
    grid.innerHTML=`<div class="empty">Une erreur est survenue : ${esc(e.message)}. Vérifie ta connexion puis réessaie.</div>`;
  }
}

function applyFilters(){
  const year=document.querySelector("#year-filter").value;
  const score=Number(document.querySelector("#score-filter").value||0);
  const status=document.querySelector("#status-filter").value;
  const format=document.querySelector("#format-filter").value;
  const lang=document.querySelector("#language-filter").value;
  let list=state.rawAnime.filter(a=>{
    if(year && String(a.seasonYear||"")!==year)return false;
    if(score && (a.averageScore||0)<score)return false;
    if(status && a.status!==status)return false;
    if(format && a.format!==format)return false;
    const av=availability(a);
    if(lang==="VF"&&!av.vf)return false;
    return true;
  });
  document.querySelector("#results-status").textContent=`${list.length} résultat(s)`;
  document.querySelector("#anime-grid").innerHTML=list.length?list.map(card).join(""):`<div class="empty">Aucun anime ne correspond à tes filtres.</div>`;
}

async function openDetail(id){
  const modal=document.querySelector("#modal"), content=document.querySelector("#modal-content");
  modal.classList.remove("hidden"); content.innerHTML='<div class="loading">Chargement…</div>';
  try{
    const data=await anilist(`query($id:Int){Media(id:$id,type:ANIME){${animeFields}}}`,{id});
    const a=data.Media,av=availability(a);
const title=titleOf(a);
const originalDescription=cleanDescription(a.description);
const desc=await translateToFrench(originalDescription);
    const studios=a.studios?.nodes?.map(s=>s.name).join(", ")||"Non renseigné";
    content.innerHTML=`<div class="detail">
      <img src="${esc(a.coverImage?.extraLarge||a.coverImage?.large||"")}" alt="${esc(title)}">
      <div class="detail-body">
        <p class="eyebrow">${esc(a.format||"ANIME")} · ${a.seasonYear||"—"}</p>
        <h2>${esc(title)}</h2>
        <div class="meta"><span>★ ${a.averageScore?((a.averageScore/10).toFixed(1)):"—"}</span><span>•</span><span>${a.episodes||"?"} épisodes</span><span>•</span><span>${esc(a.status||"—")}</span></div>
        <div class="availability">${av.vf?'<span class="badge vf">VF disponible</span>': '<span>VF : à vérifier</span>'}<span class="badge vostfr">VO / VOSTFR : disponible</span><span>Plateforme : ${esc(av.platform)}</span></div>
        <p>${esc(desc)}</p>
        <p><strong>Studio :</strong> ${esc(studios)}</p>
        <div class="detail-tags">${(a.genres||[]).map(g=>`<span>${esc(g)}</span>`).join("")}</div>
      </div>
    </div>`;
  }catch(e){content.innerHTML=`<div class="empty">Impossible de charger ce titre.</div>`}
}

function parseIntent(text){
  const t=text.toLowerCase();
  const genres=[
    ["action","Action"],["romance","Romance"],["romantique","Romance"],["comédie","Comedy"],["comedie","Comedy"],
    ["horreur","Horror"],["horror","Horror"],["isekai","Isekai"],["aventure","Adventure"],["fantasy","Fantasy"],
    ["fantastique","Fantasy"],["sport","Sports"],["mystère","Mystery & Suspense"],["mystere","Mystery & Suspense"],
    ["science-fiction","Sci-Fi"],["sf","Sci-Fi"],["slice of life","Slice of Life"]
  ];
  const found=genres.find(([k])=>t.includes(k));
  const wantsVF=/\bvf\b|français|francais|doublage/.test(t);
  const wantsVO=/\bvo\b|vostfr|sous-titre|sous titre/.test(t);
  const liked=found?.[1]||"";
  const long=/beaucoup d['’]épisodes|long|longue|plusieurs saisons/.test(t);
  const dark=/sombre|dark|violent|mature/.test(t);
  return {liked,wantsVF,wantsVO,long,dark};
}

async function recommendFromChat(text){
  const intent=parseIntent(text);
  let list=[];
  if(intent.liked){
    const cat=categories.find(c=>c.value===intent.liked || c.name.toLowerCase()===intent.liked.toLowerCase());
    if(cat) list=await getCategory(cat);
    else list=await searchAnime(intent.liked);
  } else {
    list=await searchAnime(text.slice(0,80));
    if(list.length<5) list=await getCategory(categories[6]);
  }
  let ranked=list.map(a=>{
    let score=a.averageScore||0;
    const tags=(a.tags||[]).map(x=>x.name.toLowerCase()).join(" ");
    if(intent.long && (a.episodes||0)>=24)score+=8;
    if(intent.dark && /psychological|dark|violence|horror|seinen/.test(tags))score+=5;
    if(intent.wantsVF && availability(a).vf)score+=15;
    if(intent.wantsVO)score+=2;
    return {a,score};
  }).sort((x,y)=>y.score-x.score);
  ranked=ranked.filter(x=>!intent.wantsVF || availability(x.a).vf);
  return ranked.slice(0,5).map(x=>x.a);
}

function addMessage(role, html){
  const box=document.querySelector("#chat-messages");
  const el=document.createElement("div"); el.className=`message ${role}`;
  el.innerHTML=role==="assistant"?`<div class="avatar">✦</div><div><strong>AnimeFlow</strong><p>${html}</p></div>`:`<div class="avatar">●</div><div><strong>Toi</strong><p>${html}</p></div>`;
  box.appendChild(el);box.scrollTop=box.scrollHeight;
}

async function handleChat(text){
  addMessage("user",esc(text));
  if(state.chatBusy)return;
  state.chatBusy=true;
  addMessage("assistant","Je cherche dans AniList des titres qui correspondent à tes goûts…");
  try{
    const results=await recommendFromChat(text);
    const messages=document.querySelectorAll("#chat-messages .message");
    const last=messages[messages.length-1];
    if(!results.length){
      last.querySelector("p").textContent="Je n'ai trouvé aucun résultat correspondant à ce que tu demandes. Essaie avec un genre ou une ambiance plus générale.";
    }else{
      const intent=parseIntent(text);
      last.querySelector("p").innerHTML=`J'ai trouvé ${results.length} vrais titres dans AniList. ${intent.wantsVF?"J'ai appliqué le filtre VF. ":""}Voici mes meilleures pistes :<br><br>${results.map(a=>{
        const av=availability(a);
        return `<button class="chat-result" data-id="${a.id}"><b>${esc(titleOf(a))}</b> · ★ ${a.averageScore?((a.averageScore/10).toFixed(1)):"—"} · ${a.seasonYear||"—"}<br><small>${av.vf?"VF disponible":"VF à vérifier"} · VOSTFR · ${esc((a.genres||[]).slice(0,3).join(" · "))}</small></button>`;
      }).join("")}`;
    }
  }catch(e){
    const messages=document.querySelectorAll("#chat-messages .message");
    messages[messages.length-1].querySelector("p").textContent="Je n'arrive pas à contacter AniList pour le moment. Réessaie dans quelques secondes.";
  }finally{state.chatBusy=false;}
}

document.addEventListener("click",e=>{
  const cat=e.target.closest("[data-cat]"); if(cat)openCategory(categories[Number(cat.dataset.cat)]);
  const cardEl=e.target.closest(".anime-card"); if(cardEl)openDetail(Number(cardEl.dataset.id));
  const result=e.target.closest(".chat-result"); if(result)openDetail(Number(result.dataset.id));
  if(e.target.closest("[data-go-chat]"))document.querySelector("#chat").scrollIntoView({behavior:"smooth"});
  if(e.target.closest("[data-close-modal]"))document.querySelector("#modal").classList.add("hidden");
  if(e.target.closest("#back-categories"))document.querySelector("#categories").scrollIntoView({behavior:"smooth"});
  const chip=e.target.closest(".prompt-chip"); if(chip){document.querySelector("#chat-input").value=chip.textContent;document.querySelector("#chat-input").focus();}
});
document.querySelector("#chat-form").addEventListener("submit",e=>{e.preventDefault();const input=document.querySelector("#chat-input");const text=input.value.trim();if(text){input.value="";handleChat(text);}});
["year-filter","score-filter","status-filter","format-filter","language-filter"].forEach(id=>document.querySelector("#"+id).addEventListener("change",applyFilters));
document.querySelector("#reset-filters").addEventListener("click",()=>{["year-filter","score-filter","status-filter","format-filter","language-filter"].forEach(id=>document.querySelector("#"+id).value="");applyFilters();});
document.addEventListener("keydown",e=>{if(e.key==="Escape")document.querySelector("#modal").classList.add("hidden")});
renderCategories();
