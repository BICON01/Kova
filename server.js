const express = require("express");
const bodyParser = require("body-parser");
const Anthropic = require("@anthropic-ai/sdk");
const fs = require("fs");
const path = require("path");

const app = express();
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: false }));
app.use(express.static(path.join(__dirname, "public"), { etag: false, maxAge: 0 }));

const DATA = path.join(__dirname, "data");
if (!fs.existsSync(DATA)) fs.mkdirSync(DATA, { recursive: true });

const FILES = {
  config:     path.join(DATA, "config.json"),
  businesses: path.join(DATA, "businesses.json"),
  leads:      path.join(DATA, "leads.json"),
};

function readJSON(file, fallback) {
  try { return JSON.parse(fs.readFileSync(file, "utf8")); } catch { return fallback; }
}
function writeJSON(file, data) { fs.writeFileSync(file, JSON.stringify(data, null, 2)); }

const db = {
  cfg:       () => readJSON(FILES.config, {}),
  saveCfg:   (d) => writeJSON(FILES.config, { ...db.cfg(), ...d }),
  biz:       () => readJSON(FILES.businesses, []),
  saveBiz:   (d) => writeJSON(FILES.businesses, d),
  leads:     () => readJSON(FILES.leads, []),
  saveLeads: (d) => writeJSON(FILES.leads, d),
};

const PLANS = {
  starter: { id:"starter", name:"Starter",    price:15000, services:["csr"] },
  growth:  { id:"growth",  name:"Growth",     price:25000, services:["ads","csr"] },
  suite:   { id:"suite",   name:"Full Suite", price:35000, services:["ads","csr","email"] },
  custom:  { id:"custom",  name:"Custom",     price:0,     services:[] },
};

const conversations = {};

async function deepResearch(biz) {
  const cfg = db.cfg();
  if (!cfg.ANTHROPIC_API_KEY) throw new Error("Anthropic API key not configured. Go to Setup tab.");
  const ai = new Anthropic({ apiKey: cfg.ANTHROPIC_API_KEY });
  const services = Array.isArray(biz.services) ? biz.services : [];
  const needsAds = services.includes("ads");
  const needsCSR = services.includes("csr");
  const needsEmail = services.includes("email");

  const prompt = `You are a world-class Nigerian digital marketing strategist.

Business: ${biz.name || "Unknown"}
Industry: ${biz.industry || "General"}
Products: ${biz.products || "Various products"}
Location: ${biz.location || "Nigeria"}
Target Audience: ${biz.targetAudience || "Nigerian buyers"}
Price Range: NGN ${biz.priceMin || 0} to NGN ${biz.priceMax || 0}
Top Sellers: ${biz.topSellers || "Not specified"}
Services Needed: ${services.join(", ") || "general"}

Return ONLY raw valid JSON. No markdown, no code fences, no explanation. Start response with { and end with }

{
  "audienceInsights": {
    "demographics": "describe Nigerian buyer demographics",
    "psychographics": "what emotionally drives them",
    "painPoints": ["pain 1","pain 2","pain 3"],
    "desires": ["desire 1","desire 2","desire 3"],
    "buyingTriggers": ["trigger 1","trigger 2","trigger 3"]
  },
  "adsStrategy": ${needsAds ? `{
    "marketIntelligence": {
      "whatCompetitorsDo": "What competitors in this Nigerian niche do well in marketing",
      "competitorWeaknesses": "Gaps and mistakes competitors make that this business can exploit",
      "yourEdge": "How this business stands out from competitors",
      "bestPlatforms": ["Instagram","Facebook"],
      "bestPostingTimes": "Best posting times for Nigerian audience",
      "emotionalAngle": "Core emotional angle for Nigerian buyers in this niche"
    },
    "recommendedStrategy": {
      "overallApproach": "Overall recommended ad strategy",
      "primaryPlatform": "Best single platform to start with and why",
      "contentPillars": ["pillar 1","pillar 2","pillar 3"],
      "keyMessage": "Most powerful brand message for all ads",
      "targetAudienceDefinition": "Precise audience targeting definition"
    },
    "lowBudgetCampaign": {
      "budgetRange": "NGN 5000 to NGN 20000 per month",
      "campaignGoal": "Goal of low budget campaign",
      "platform": "Platform to use and why",
      "adFormat": "Best ad format for this budget",
      "instagramCaption": "Full Instagram caption with emojis and hashtags ready to post",
      "facebookAdCopy": "Full Facebook ad copy ready to post",
      "whatsappBroadcast": "Full WhatsApp broadcast message ready to send",
      "keywords": ["kw1","kw2","kw3","kw4","kw5"],
      "hashtags": ["#tag1","#tag2","#tag3","#tag4","#tag5","#tag6","#tag7","#tag8"],
      "expectedResults": "Realistic results at this budget",
      "tips": ["tip 1","tip 2","tip 3"]
    },
    "highBudgetCampaign": {
      "budgetRange": "NGN 50000 to NGN 200000 per month",
      "campaignGoal": "Goal of high budget campaign at scale",
      "platforms": ["platform 1","platform 2"],
      "adFormats": ["format 1","format 2"],
      "instagramCaption": "Full Instagram caption different angle from low budget",
      "facebookAdCopy": "Full Facebook ad copy different angle from low budget",
      "whatsappBroadcast": "Full WhatsApp broadcast message",
      "keywords": ["kw1","kw2","kw3","kw4","kw5","kw6","kw7","kw8"],
      "hashtags": ["#tag1","#tag2","#tag3","#tag4","#tag5","#tag6","#tag7","#tag8","#tag9","#tag10"],
      "expectedResults": "Realistic results at higher budget",
      "extraActivities": ["activity 1","activity 2","activity 3"]
    }
  }` : "null"},
  "csrStrategy": ${needsCSR ? `{
    "agentPersonality": "How Aria presents for this brand",
    "dmOpeningScript": "First message Aria sends when someone DMs",
    "objections": {
      "price": "Response to price too high",
      "quality": "Response to quality concerns",
      "trust": "Response to trust concerns",
      "delay": "Response to will think about it",
      "noMoney": "Response to no money right now"
    },
    "closingScript": "What Aria says to close the deal",
    "escalationTriggers": ["trigger 1","trigger 2"]
  }` : "null"},
  "emailStrategy": ${needsEmail ? `{
    "sequence": [
      {"day":1,"subject":"Day 1 subject","body":"Day 1 email body"},
      {"day":3,"subject":"Day 3 subject","body":"Day 3 email body"},
      {"day":7,"subject":"Day 7 subject","body":"Day 7 email body"}
    ],
    "reEngagementEmail": {"subject":"Re-engagement subject","body":"Re-engagement body"}
  }` : "null"}
}`;

  const resp = await ai.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 4000,
    messages: [{ role: "user", content: prompt }]
  });

  let raw = resp.content[0].text.trim();
  raw = raw.replace(/^```json\s*/i,"").replace(/^```\s*/i,"").replace(/\s*```$/i,"").trim();

  try {
    return JSON.parse(raw);
  } catch(e) {
    console.error("Parse error:", e.message, "Raw:", raw.substring(0,300));
    return { error: true, message: "Could not parse research results. Please try again.", raw: raw.substring(0,500) };
  }
}

async function agentReply(phone, message, biz) {
  const cfg = db.cfg();
  if (!cfg.ANTHROPIC_API_KEY) throw new Error("No API key configured");
  const ai = new Anthropic({ apiKey: cfg.ANTHROPIC_API_KEY });
  if (!conversations[phone]) conversations[phone] = [];
  conversations[phone].push({ role:"user", content:message });
  const r = biz.research || {};
  const csr = r.csrStrategy || {};
  const ins = r.audienceInsights || {};
  const system = `You are Aria, expert AI sales agent for ${biz.name}.
Products: ${biz.products || "various"}, Price: NGN ${biz.priceMin||0}-${biz.priceMax||0}
Brand Voice: ${csr.agentPersonality || "warm, professional, persuasive"}
Pain Points: ${(ins.painPoints||[]).join(", ")||"not specified"}
Buying Triggers: ${(ins.buyingTriggers||[]).join(", ")||"not specified"}
Objections: ${JSON.stringify(csr.objections||{})}
Closing: ${csr.closingScript||"Make it easy to say yes"}
RULES: Keep replies 2-4 sentences. Be warm and relatable for Nigerian buyers. Build trust around delivery and authenticity.
When ready to buy collect name and address. Add on new line: [DEAL_READY] [NAME:firstname] [EMOTION:excited/hesitant/skeptical/cold/ready]`;
  const resp = await ai.messages.create({ model:"claude-sonnet-4-20250514", max_tokens:350, system, messages:conversations[phone] });
  const reply = resp.content[0].text;
  conversations[phone].push({ role:"assistant", content:reply });
  return reply;
}

app.get("/api/plans", (req,res) => res.json(PLANS));

app.post("/api/signup", (req,res) => {
  try {
    const businesses = db.biz();
    const { plan, customServices, ...bizData } = req.body;
    const planData = PLANS[plan] || PLANS.custom;
    const services = plan==="custom" ? (Array.isArray(customServices)?customServices:[]) : planData.services;
    const price = plan==="custom" ? (services.includes("ads")?10000:0)+(services.includes("csr")?10000:0)+(services.includes("email")?8000:0) : planData.price;
    const biz = { id:Date.now().toString(), ...bizData, plan, services, monthlyPrice:price, status:"pending_research", approved:false, onboardedBy:"self", subscriptionStatus:"trial", trialEnds:new Date(Date.now()+7*86400000).toISOString(), leads:0, deals:0, research:null, createdAt:new Date().toISOString() };
    businesses.push(biz);
    db.saveBiz(businesses);
    res.json({ ok:true, businessId:biz.id });
  } catch(e) { console.error(e); res.status(500).json({ error:e.message }); }
});

app.post("/api/business/register", (req,res) => {
  try {
    const businesses = db.biz();
    const { plan, customServices, ...bizData } = req.body;
    const planData = PLANS[plan] || PLANS.custom;
    const services = plan==="custom" ? (Array.isArray(customServices)?customServices:[]) : planData.services;
    const biz = { id:Date.now().toString(), ...bizData, plan, services, monthlyPrice:planData.price||0, status:"pending_research", approved:false, onboardedBy:"admin", subscriptionStatus:"trial", trialEnds:new Date(Date.now()+7*86400000).toISOString(), leads:0, deals:0, research:null, createdAt:new Date().toISOString() };
    businesses.push(biz);
    db.saveBiz(businesses);
    res.json({ ok:true, businessId:biz.id });
  } catch(e) { console.error(e); res.status(500).json({ error:e.message }); }
});

app.post("/api/business/:id/research", async (req,res) => {
  const businesses = db.biz();
  const biz = businesses.find(b => b.id===req.params.id);
  if (!biz) return res.status(404).json({ error:"Business not found" });
  biz.status = "researching";
  db.saveBiz(businesses);
  try {
    const research = await deepResearch(biz);
    biz.research = research;
    biz.status = research.error ? "pending_research" : "pending_approval";
    db.saveBiz(businesses);
    res.json({ ok:!research.error, research, error:research.error?research.message:null });
  } catch(e) {
    console.error("Research error:", e);
    biz.status = "pending_research";
    db.saveBiz(businesses);
    res.status(500).json({ error:e.message });
  }
});

app.post("/api/business/:id/approve", (req,res) => {
  const businesses = db.biz();
  const biz = businesses.find(b => b.id===req.params.id);
  if (!biz) return res.status(404).json({ error:"Not found" });
  biz.approved=true; biz.status="active";
  db.saveBiz(businesses);
  res.json({ ok:true });
});

app.post("/api/business/:id/subscription", (req,res) => {
  const businesses = db.biz();
  const biz = businesses.find(b => b.id===req.params.id);
  if (!biz) return res.status(404).json({ error:"Not found" });
  biz.subscriptionStatus = req.body.status;
  if (req.body.status==="paid") { biz.paidAt=new Date().toISOString(); biz.nextBillingDate=new Date(Date.now()+30*86400000).toISOString(); }
  db.saveBiz(businesses);
  res.json({ ok:true });
});

app.get("/api/businesses", (req,res) => res.json(db.biz()));
app.get("/api/business/:id", (req,res) => { const b=db.biz().find(x=>x.id===req.params.id); b?res.json(b):res.status(404).json({error:"Not found"}); });

app.get("/api/leads", (req,res) => {
  let leads = db.leads();
  if (req.query.businessId) leads = leads.filter(l=>l.businessId===req.query.businessId);
  res.json(leads.sort((a,b)=>new Date(b.lastActivity)-new Date(a.lastActivity)));
});

app.post("/api/lead/:id/status", (req,res) => {
  const leads = db.leads();
  const l = leads.find(x=>x.id==req.params.id);
  if (!l) return res.status(404).json({error:"Not found"});
  l.status=req.body.status; db.saveLeads(leads); res.json({ok:true});
});

app.get("/api/conversation/:phone", (req,res) => res.json(conversations[decodeURIComponent(req.params.phone)]||[]));

app.get("/api/stats", (req,res) => {
  const b=db.biz(), l=db.leads();
  const revenue = b.filter(x=>x.subscriptionStatus==="paid").reduce((s,x)=>s+(x.monthlyPrice||0),0);
  res.json({
    totalBusinesses:b.length, activeBusinesses:b.filter(x=>x.status==="active").length,
    pendingApproval:b.filter(x=>x.status==="pending_approval").length,
    totalLeads:l.length, hotLeads:l.filter(x=>x.status==="hot").length,
    closedDeals:l.filter(x=>x.status==="closed").length, monthlyRevenue:revenue,
    serviceBreakdown:{
      ads:b.filter(x=>Array.isArray(x.services)&&x.services.includes("ads")).length,
      csr:b.filter(x=>Array.isArray(x.services)&&x.services.includes("csr")).length,
      email:b.filter(x=>Array.isArray(x.services)&&x.services.includes("email")).length,
    }
  });
});

app.get("/api/config", (req,res) => {
  const cfg=db.cfg(); const safe={...cfg};
  if(safe.ANTHROPIC_API_KEY) safe.ANTHROPIC_API_KEY="sk-***"+safe.ANTHROPIC_API_KEY.slice(-4);
  if(safe.TWILIO_AUTH_TOKEN) safe.TWILIO_AUTH_TOKEN="***"+safe.TWILIO_AUTH_TOKEN.slice(-4);
  res.json({configured:!!cfg.ANTHROPIC_API_KEY,...safe});
});
app.post("/api/config", (req,res) => { db.saveCfg(req.body); res.json({ok:true}); });

app.post("/webhook/whatsapp", async (req,res) => {
  const cfg=db.cfg(); const msg=req.body.Body||""; const from=req.body.From||"";
  try {
    const businesses=db.biz();
    const biz=businesses.find(b=>b.approved&&Array.isArray(b.services)&&b.services.includes("csr"))||businesses.find(b=>b.approved)||businesses[0];
    if(!biz) return res.status(200).send("No active business");
    const reply=await agentReply(from,msg,biz);
    const isDeal=reply.includes("[DEAL_READY]");
    const nameM=reply.match(/\[NAME:(.+?)\]/); const emoM=reply.match(/\[EMOTION:(.+?)\]/);
    const clean=reply.replace(/\[DEAL_READY\]/g,"").replace(/\[NAME:.+?\]/g,"").replace(/\[EMOTION:.+?\]/g,"").trim();
    const leads=db.leads();
    let lead=leads.find(l=>l.phone===from&&l.businessId===biz.id);
    if(!lead){
      lead={id:Date.now(),businessId:biz.id,businessName:biz.name,service:"csr",phone:from,name:nameM?nameM[1]:"Customer",status:"chatting",emotion:emoM?emoM[1]:"unknown",firstContact:new Date().toISOString(),lastMessage:msg,lastActivity:new Date().toISOString()};
      leads.push(lead); biz.leads=(biz.leads||0)+1; db.saveBiz(businesses);
    } else { lead.lastMessage=msg; lead.lastActivity=new Date().toISOString(); if(nameM)lead.name=nameM[1]; if(emoM)lead.emotion=emoM[1]; }
    if(isDeal){lead.status="hot";biz.deals=(biz.deals||0)+1;db.saveBiz(businesses);}
    db.saveLeads(leads);
    if(cfg.TWILIO_ACCOUNT_SID&&cfg.TWILIO_AUTH_TOKEN){
      const twilio=require("twilio")(cfg.TWILIO_ACCOUNT_SID,cfg.TWILIO_AUTH_TOKEN);
      await twilio.messages.create({from:`whatsapp:${cfg.TWILIO_WHATSAPP_FROM}`,to:from,body:clean});
      if(isDeal&&cfg.OWNER_WHATSAPP) await twilio.messages.create({from:`whatsapp:${cfg.TWILIO_WHATSAPP_FROM}`,to:`whatsapp:${cfg.OWNER_WHATSAPP}`,body:`🔥 HOT LEAD — ${biz.name}\n👤 ${lead.name}\n📱 ${from}\n💬 "${msg}"\nCheck Kova dashboard.`});
    }
    res.status(200).send("OK");
  } catch(e){ console.error("Webhook error:",e); res.status(500).send("Error"); }
});

app.get("/health", (req,res) => res.json({status:"ok",time:new Date().toISOString()}));

const PORT=process.env.PORT||3000;
app.listen(PORT,"0.0.0.0",()=>console.log(`🚀 Kova running on port ${PORT}`));
