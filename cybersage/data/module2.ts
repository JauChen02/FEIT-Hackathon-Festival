// Module 2: Threats & Exploits — Genius Armoury
// Content from Untapped Holdings Pty Ltd, for FEIT Hackathon 2026 use only

export interface LessonCard {
  id: string;
  type: "fact" | "case-study" | "framework" | "warning" | "tip";
  title: string;
  body: string;
  stat?: string;
  statLabel?: string;
  emoji?: string;
}

export interface QuizQuestion {
  id: string;
  question: string;
  options: string[];
  correctIndex: number;
  explanation: string;
  xp: number;
}

export interface Chapter {
  id: string;
  number: number;
  title: string;
  subtitle: string;
  emoji: string;
  color: string; // tailwind gradient class
  accentHex: string;
  estimatedMinutes: number;
  cards: LessonCard[];
  quiz: QuizQuestion[];
}

export const module2: { id: string; title: string; subtitle: string; chapters: Chapter[] } = {
  id: "module-2",
  title: "Threats & Exploits",
  subtitle: "How cyber threats have evolved — real incidents, attacker motivations, and defensive strategies.",
  chapters: [
    // ─────────────────────────────────────────────
    // CHAPTER 1: THE CYBERCRIME LANDSCAPE
    // ─────────────────────────────────────────────
    {
      id: "ch1-landscape",
      number: 1,
      title: "The Cybercrime Landscape",
      subtitle: "Why cybersecurity is a global financial crisis",
      emoji: "🌐",
      color: "from-blue-900 to-blue-800",
      accentHex: "#2D7DD2",
      estimatedMinutes: 4,
      cards: [
        {
          id: "c1-1",
          type: "fact",
          emoji: "💸",
          title: "$11.3 Trillion — The Cost of Cybercrime",
          body: "Cybercrime losses now exceed the GDP of most major nations. It has become a global financial security crisis, driven by the rise of AI and Cybercrime-as-a-Service (CaaS). Attacks are faster, more sophisticated, and happening at unprecedented frequency.",
          stat: "$11.3T",
          statLabel: "Projected global cost of cybercrime",
        },
        {
          id: "c1-2",
          type: "fact",
          emoji: "🏛️",
          title: "Governments Are Responding",
          body: "Australia's 2023–2030 Cyber Security Strategy focuses on critical infrastructure protection, stronger law enforcement, and building a skilled workforce.\n\nThe United States has shifted from reactive responses to proactive risk reduction — designing security in from the start and disrupting threat actors before they strike.",
        },
        {
          id: "c1-3",
          type: "case-study",
          emoji: "🤖",
          title: "Case Study: HuggingFace Attack (July 2026)",
          body: "HuggingFace suffered the first fully autonomous AI agent attack. A malicious dataset was uploaded to the platform's pipeline. The AI exploited vulnerabilities to escalate to node-level access, harvested credentials, performed lateral movement, and staged command-and-control on public cloud services.\n\nThe AI executed tens of thousands of actions across sandboxes — entirely without human operators. AI-driven offensive tooling is real, scalable, and lowers the cost of running patient, multi-stage campaigns.",
        },
        {
          id: "c1-4",
          type: "framework",
          emoji: "🗺️",
          title: "MITRE ATT&CK: Mapping the HuggingFace Attack",
          body: "MITRE ATT&CK is a framework that breaks multi-stage attacks into tactics and techniques:\n\n🔴 Initial Access — Malicious dataset uploaded to data pipeline\n🟠 Execution — Exploit code ran on HuggingFace workers\n🟡 Privilege Escalation — Escalated to node-level access\n🔵 Credential Access — Harvested API tokens and cloud keys\n🟣 Lateral Movement — Pivoted across clusters\n⚫ Command & Control — Built hidden channels on public cloud\n🔴 Collection/Exfiltration — Gathered internal datasets",
        },
        {
          id: "c1-5",
          type: "warning",
          emoji: "⚖️",
          title: "The Asymmetry Problem",
          body: "Attackers' AI: unrestricted — can generate and analyse malicious payloads freely.\n\nDefenders' AI: blocked by safety guardrails when analysing attack artifacts.\n\nThis creates a fundamental disadvantage: attackers innovate without limits, defenders are slowed by restrictions.\n\nSolution: Organisations must deploy locally-hosted, open-weight AI models for incident response — keeping forensic data sovereign and removing guardrail limitations.",
        },
      ],
      quiz: [
        {
          id: "q1-1",
          question: "What made the HuggingFace attack (July 2026) historically significant?",
          options: [
            "It was the largest data breach by file size",
            "It was the first fully autonomous AI agent attack",
            "It targeted government infrastructure",
            "It used quantum computing to break encryption",
          ],
          correctIndex: 1,
          explanation: "The HuggingFace attack was significant because it was the first fully autonomous AI agent attack — no human operator was needed. The AI executed tens of thousands of actions entirely on its own.",
          xp: 80,
        },
        {
          id: "q1-2",
          question: "In the MITRE ATT&CK framework, what tactic does 'stealing API tokens and cloud keys' represent?",
          options: ["Lateral Movement", "Initial Access", "Credential Access", "Exfiltration"],
          correctIndex: 2,
          explanation: "Stealing API tokens and cloud keys is classified as Credential Access in MITRE ATT&CK — the attacker is collecting credentials that allow them to expand their reach and authenticate as legitimate users.",
          xp: 100,
        },
        {
          id: "q1-3",
          question: "Why does the 'asymmetry problem' in AI give attackers an advantage?",
          options: [
            "Attackers have faster computers",
            "Defender AI is blocked by safety guardrails; attacker AI has no restrictions",
            "Attackers can afford more expensive AI",
            "Government regulations limit defensive AI use",
          ],
          correctIndex: 1,
          explanation: "The asymmetry problem: defenders' AI tools are restricted by safety guardrails (e.g., they can't analyse malware payloads), while attackers' AI has no such restrictions. This fundamentally advantages attackers.",
          xp: 100,
        },
      ],
    },

    // ─────────────────────────────────────────────
    // CHAPTER 2: THREAT ACTORS
    // ─────────────────────────────────────────────
    {
      id: "ch2-actors",
      number: 2,
      title: "Threat Actors",
      subtitle: "Who attacks — and why",
      emoji: "🎭",
      color: "from-purple-900 to-purple-800",
      accentHex: "#7C3AED",
      estimatedMinutes: 5,
      cards: [
        {
          id: "c2-1",
          type: "framework",
          emoji: "🎭",
          title: "The Four Primary Threat Actors",
          body: "Every cyberattack is driven by motivation. There are four primary groups:\n\n🏴 Hacktivists — Ideologically motivated, use DDoS attacks to spread political messaging\n💰 Cybercriminals — Financially motivated, use Ransomware-as-a-Service (RaaS) to extort\n🏛️ Nation-State Actors — State-sponsored, use AI for espionage and infrastructure disruption\n👤 Insiders — Employees driven by grievance or bribery who misuse access",
        },
        {
          id: "c2-2",
          type: "fact",
          emoji: "💰",
          title: "Ransomware-as-a-Service (RaaS)",
          body: "Cybercriminals don't all build their own tools anymore. RaaS works like a franchise model — criminal syndicates license ransomware tools to affiliates who run the attacks, sharing the profits.\n\nThis lowers the technical barrier dramatically: you no longer need to be a programmer to run a ransomware campaign. This is why attacks are scaling so fast.",
          stat: "RaaS",
          statLabel: "Ransomware-as-a-Service — cybercrime as a franchise",
        },
        {
          id: "c2-3",
          type: "case-study",
          emoji: "⚖️",
          title: "Real Incidents at a Law Firm",
          body: "One law firm experienced all major threat actor types simultaneously:\n\n🖥️ Website defacement — Hacktivists targeting reputational damage\n🎙️ AI voice-cloned vishing — Sophisticated impersonation (criminals/nation-states)\n🔒 Ransomware with exfiltration — Double extortion by organised cybercriminals\n👤 Insider misuse of credentials — Failed offboarding controls\n🌐 DNS tunnelling C2 — Advanced covert communication channel\n📦 Fake software update — Supply chain compromise attempt\n\nKey insight: Threats span technical, social, and procedural domains — defenses must be holistic.",
        },
        {
          id: "c2-4",
          type: "warning",
          emoji: "🏭",
          title: "Supply Chain Attacks",
          body: "Attackers compromise trusted vendors or software providers. Victims are breached indirectly — even if their own defenses are strong.\n\nReal examples: SolarWinds (2020), MOVEit (2023)\n\nWhy they're so dangerous:\n• Organisations cannot control vendor security\n• Updates from trusted vendors bypass normal scrutiny\n• A single compromise can affect thousands simultaneously\n\nDefenses: verify file hashes, adopt SBOM practices, conduct vendor risk assessments",
        },
      ],
      quiz: [
        {
          id: "q2-1",
          question: "Which threat actor type is primarily motivated by ideology rather than money?",
          options: ["Cybercriminals", "Nation-State Actors", "Hacktivists", "Insiders"],
          correctIndex: 2,
          explanation: "Hacktivists are ideologically motivated — they use attacks like DDoS to spread political messaging, not to make money. Think Anonymous-style groups targeting organisations they oppose politically.",
          xp: 60,
        },
        {
          id: "q2-2",
          question: "What makes Ransomware-as-a-Service (RaaS) particularly dangerous?",
          options: [
            "It is impossible to decrypt",
            "It lowers the technical barrier — anyone can run ransomware campaigns",
            "It only targets governments",
            "It cannot be detected by antivirus",
          ],
          correctIndex: 1,
          explanation: "RaaS works like a franchise — criminal groups license their ransomware to affiliates who run attacks without needing technical skills. This dramatically scales the volume of ransomware attacks worldwide.",
          xp: 80,
        },
        {
          id: "q2-3",
          question: "Why are supply chain attacks especially hard to defend against?",
          options: [
            "They use quantum computing",
            "They are always nation-state sponsored",
            "Updates from trusted vendors bypass normal security scrutiny",
            "They only target open-source software",
          ],
          correctIndex: 2,
          explanation: "Supply chain attacks are insidious because organisations inherently trust updates from their vendors — so malicious code hidden in a legitimate update bypasses the scrutiny applied to unknown sources. SolarWinds is the classic example.",
          xp: 100,
        },
        {
          id: "q2-4",
          question: "An insider threat actor is most commonly motivated by:",
          options: [
            "Political ideology",
            "Technical curiosity",
            "Grievance or bribery",
            "National security interests",
          ],
          correctIndex: 2,
          explanation: "Insider threats are typically driven by personal grievance (disgruntled employees) or financial incentives (bribery from external attackers). This is why offboarding processes and least-privilege access are critical controls.",
          xp: 60,
        },
      ],
    },

    // ─────────────────────────────────────────────
    // CHAPTER 3: AI WEAPONIZATION
    // ─────────────────────────────────────────────
    {
      id: "ch3-ai",
      number: 3,
      title: "AI Weaponization",
      subtitle: "How AI is being used as an attack tool",
      emoji: "🤖",
      color: "from-red-900 to-rose-900",
      accentHex: "#DC2626",
      estimatedMinutes: 5,
      cards: [
        {
          id: "c3-1",
          type: "warning",
          emoji: "🤖",
          title: "The AI Attacker",
          body: "AI is actively lowering the technical barriers for cyber attacks and accelerating attack cycles:\n\n⚡ Automated Attacks — LLMs write new polymorphic malware that evades signature detection by discovering zero-days\n\n🎯 Hyper-Impersonation — Using corporate data, AI creates highly personalised phishing lures at massive scale\n\n🎭 Deepfake Technology — Real-time voice and video impersonation to bypass biometric security and deceive finance teams (BEC fraud)",
        },
        {
          id: "c3-2",
          type: "framework",
          emoji: "📧",
          title: "Four AI-Powered Attack Methods",
          body: "📧 Phishing — Deceptive emails using AI to mimic internal communications, eliminating grammar errors that used to be red flags\n\n📞 Vishing — Real-time AI voice/video generation to bypass voice-verification and coerce wire transfers\n\n📱 Smishing — SMS phishing exploiting the trust users place on mobile notifications\n\n📷 Quishing — QR code attacks that bypass email filters via mobile scanning",
        },
        {
          id: "c3-3",
          type: "case-study",
          emoji: "📨",
          title: "Spot the Phishing Email",
          body: "AI has made phishing emails almost perfect. Here's how to distinguish them:\n\n❌ Email A (PHISHING): Fake Commonwealth Bank domain, artificial urgency, credential harvesting link\n\n❌ Email B (SPEAR PHISHING): Fake familiarity with a real event (LegalTech Summit), vague context, malicious attachment\n\n✅ Email C (LEGITIMATE): Correct ATO domain, no credential request, no urgency\n\n⚠️ Key insight: AI removes traditional red flags like grammar errors and poor formatting. Detection must evolve to behavioural awareness.",
        },
        {
          id: "c3-4",
          type: "tip",
          emoji: "🔍",
          title: "Behavioural Detection: The New Standard",
          body: "Since AI eliminates linguistic errors, employees must be trained to spot behavioural red flags:\n\n⏰ Urgency & pressure — artificial deadlines or threats\n⚠️ Requests for risky actions — clicking links, opening attachments, providing credentials\n❓ Unverifiable context — references to meetings or events that cannot be confirmed independently\n\nKey message: Behavioural awareness is now more reliable than linguistic analysis.",
        },
      ],
      quiz: [
        {
          id: "q3-1",
          question: "What is 'Quishing'?",
          options: [
            "A type of ransomware using QR codes",
            "QR code attacks that bypass email filters via mobile scanning",
            "A deepfake video technique",
            "AI-generated voice calls to steal credentials",
          ],
          correctIndex: 1,
          explanation: "Quishing uses malicious QR codes to bypass email security filters — because email scanners check links but often can't decode QR codes. Victims scan the code on their phone and are directed to a phishing site.",
          xp: 80,
        },
        {
          id: "q3-2",
          question: "Why has AI made phishing emails so much more dangerous?",
          options: [
            "They are now sent from real email addresses",
            "AI can send millions of emails per second",
            "AI eliminates the grammar errors and poor formatting that used to be red flags",
            "AI makes phishing links look identical to real URLs",
          ],
          correctIndex: 2,
          explanation: "Traditional phishing was detectable by poor grammar, odd formatting, and generic language. AI can now create perfectly written, contextually accurate, personalised emails — eliminating the cues defenders relied on.",
          xp: 80,
        },
        {
          id: "q3-3",
          question: "You receive an urgent email from your bank asking you to click a link to verify your identity or your account will be suspended. What is the FIRST behavioural red flag?",
          options: [
            "The email has a spelling mistake",
            "Artificial urgency — creating pressure to act immediately without thinking",
            "The email is from a free email provider",
            "The email logo looks slightly wrong",
          ],
          correctIndex: 1,
          explanation: "Artificial urgency is the primary behavioural red flag — legitimate organisations rarely create immediate threats to force quick action. The urgency is designed to bypass your rational thinking.",
          xp: 100,
        },
        {
          id: "q3-4",
          question: "A finance team member receives a video call from someone appearing to be the CEO requesting an urgent wire transfer. What type of attack is this?",
          options: [
            "Smishing",
            "Quishing",
            "Deepfake Vishing (BEC fraud)",
            "Ransomware",
          ],
          correctIndex: 2,
          explanation: "This is a Business Email Compromise (BEC) attack using deepfake technology — AI-generated real-time video/audio to impersonate a senior executive. Finance teams are primary targets because they have authority to transfer funds.",
          xp: 100,
        },
      ],
    },

    // ─────────────────────────────────────────────
    // CHAPTER 4: MALWARE & MITRE ATT&CK
    // ─────────────────────────────────────────────
    {
      id: "ch4-malware",
      number: 4,
      title: "Malware Arsenal & Attack Stages",
      subtitle: "Types of malware and how staged attacks work",
      emoji: "🦠",
      color: "from-orange-900 to-amber-900",
      accentHex: "#D97706",
      estimatedMinutes: 5,
      cards: [
        {
          id: "c4-1",
          type: "framework",
          emoji: "🦠",
          title: "The Malware Arsenal",
          body: "🔒 Ransomware — Encrypts data and threatens to publish it unless a ransom is paid. Modern variants use double extortion: lock + leak.\n\n🔑 Infostealers — Extract session tokens, passwords, and API keys, later sold on the dark web to enable larger breaches.\n\n🐴 Remote Access Trojans (RATs) — Disguise as legitimate software to give attackers persistent remote access to corporate networks.\n\n🕵️ Spyware — Monitors activity via webcams and captures keystrokes. Used heavily in nation-state espionage campaigns.",
        },
        {
          id: "c4-2",
          type: "framework",
          emoji: "🗺️",
          title: "MITRE ATT&CK: The 4 Core Stages",
          body: "MITRE ATT&CK maps how attackers move through a system:\n\n1️⃣ Initial Access — Getting in: phishing emails, stolen session tokens from public apps\n\n2️⃣ Execution — Running malicious code: PowerShell scripts, macro-enabled documents\n\n3️⃣ Persistence — Staying in: adding accounts, manipulating registries so malware survives reboots\n\n4️⃣ Exfiltration — Getting data out: packaging and transferring sensitive data to attacker-controlled infrastructure",
        },
        {
          id: "c4-3",
          type: "case-study",
          emoji: "🔒",
          title: "How a Ransomware Attack Unfolds",
          body: "A typical modern ransomware attack:\n\n📧 Week 1 — Phishing email delivers initial access (often disguised as invoice)\n💻 Week 1-2 — Infostealer runs quietly, harvesting credentials\n🔵 Week 2-3 — Lateral movement: attacker maps the network, identifies valuable data\n📦 Week 3 — Data exfiltrated to attacker servers (leverage for double extortion)\n🔒 Week 4 — Ransomware deployed simultaneously across all systems\n💸 Demand — Pay to decrypt AND pay to keep data private\n\nBy the time the ransom note appears, the attacker has been inside for weeks.",
        },
        {
          id: "c4-4",
          type: "tip",
          emoji: "🛡️",
          title: "Defence at Each Stage",
          body: "Understanding the attack stages helps you defend at every step:\n\n🚫 Block Initial Access — Multi-factor authentication, email filtering, patch management\n🔍 Detect Execution — Endpoint detection and response (EDR), PowerShell logging\n✂️ Limit Persistence — Least-privilege access, registry monitoring, account audits\n🔐 Prevent Exfiltration — Data loss prevention (DLP), network segmentation, egress filtering\n\nKey principle: The earlier you detect, the less damage occurs.",
        },
      ],
      quiz: [
        {
          id: "q4-1",
          question: "What is 'double extortion' in a ransomware attack?",
          options: [
            "Attacking the same victim twice",
            "Charging double the ransom after payment",
            "Encrypting data AND threatening to publish it unless ransom is paid",
            "Using two different types of malware simultaneously",
          ],
          correctIndex: 2,
          explanation: "Double extortion adds a second threat: not only is data encrypted (making it inaccessible), but the attackers also threaten to publish the stolen data publicly. This creates pressure even if the victim has backups.",
          xp: 80,
        },
        {
          id: "q4-2",
          question: "In the MITRE ATT&CK framework, what is the 'Persistence' stage designed to achieve?",
          options: [
            "Getting initial access to the network",
            "Exfiltrating data to external servers",
            "Maintaining access to the system even if the victim tries to remove the malware",
            "Escalating privileges to admin level",
          ],
          correctIndex: 2,
          explanation: "Persistence techniques (adding accounts, manipulating registries, installing services) ensure the attacker remains inside the system even if it's rebooted or security software tries to remove the malware.",
          xp: 80,
        },
        {
          id: "q4-3",
          question: "A piece of malware disguises itself as a legitimate PDF reader but gives attackers remote access to your system. What type of malware is this?",
          options: ["Ransomware", "Spyware", "Remote Access Trojan (RAT)", "Infostealer"],
          correctIndex: 2,
          explanation: "Remote Access Trojans (RATs) disguise themselves as legitimate software — the 'Trojan horse' metaphor. Once installed, they give attackers persistent remote access to the infected machine.",
          xp: 80,
        },
        {
          id: "q4-4",
          question: "In a ransomware attack timeline, what typically happens BEFORE the ransomware is deployed?",
          options: [
            "The ransom demand is sent first",
            "The attacker exfiltrates data and maps the network over weeks",
            "The victim's backups are restored",
            "The attacker contacts the victim to negotiate",
          ],
          correctIndex: 1,
          explanation: "Modern ransomware attackers spend weeks or months inside the network before deploying ransomware — mapping systems, stealing data for double extortion, and ensuring maximum impact when they finally trigger the encryption.",
          xp: 100,
        },
      ],
    },

    // ─────────────────────────────────────────────
    // CHAPTER 5: ZERO-DAYS & QUANTUM THREATS
    // ─────────────────────────────────────────────
    {
      id: "ch5-quantum",
      number: 5,
      title: "Zero-Days & Quantum Threats",
      subtitle: "The vulnerabilities you can't patch and the encryption crisis coming",
      emoji: "⚡",
      color: "from-cyan-900 to-teal-900",
      accentHex: "#0891B2",
      estimatedMinutes: 4,
      cards: [
        {
          id: "c5-1",
          type: "fact",
          emoji: "💀",
          title: "What is a Zero-Day?",
          body: "A zero-day is a critical software vulnerability that is previously unknown to the vendor. Defenders have literally 'zero days' to fix it before exploitation begins.\n\nThe Lifecycle:\n🔍 Discovery by researcher or attacker\n⚡ Immediate weaponisation\n🌐 Active in-the-wild exploitation\n📢 Vendor discovers it\n🔧 Patch development\n🚀 Enterprise deployment\n\nThe Window of Exposure is the dangerous gap between exploitation and patching — during which millions of systems may be vulnerable.",
        },
        {
          id: "c5-2",
          type: "warning",
          emoji: "📦",
          title: "Zero-Days in Supply Chains",
          body: "Our massive reliance on shared digital components makes zero-days exponentially more dangerous. A single zero-day in a widely-used library or component instantly puts millions of interconnected systems at risk.\n\nReal-world scale: When a zero-day hits a component used in thousands of products simultaneously — like Log4Shell (2021) — the blast radius is global and patching takes months across the ecosystem.",
        },
        {
          id: "c5-3",
          type: "warning",
          emoji: "⏳",
          title: "Harvest Now, Decrypt Later (HNDL)",
          body: "Nation-state attackers are intercepting encrypted data TODAY — planning to decrypt it later using quantum computing.\n\nThe risk depends on how long your data stays sensitive:\n\n🟢 Low risk — Short-lived data (shift rosters, today's menu)\n🟡 Medium risk — Data sensitive for 1–5 years\n🔴 High/Very High risk — Medical records, AI model weights, government documents, financial records\n\nAction required: Begin migrating to Post-Quantum Cryptography (PQC) NOW — even before quantum computers exist.",
        },
        {
          id: "c5-4",
          type: "framework",
          emoji: "🔐",
          title: "Post-Quantum Cryptography (PQC)",
          body: "Once a Cryptographically Relevant Quantum Computer (CRQC) is built, current public-key encryption (RSA, ECC) will be obsolete — decryptable in hours.\n\n2026 Regulatory Turning Point: NIST implemented FIPS 203/204/205 standards for Post-Quantum Cryptography.\n\nAustralian Signals Directorate (ASD) guidance: All organisations should have a PQC transition plan in place.\n\nWhat to do now:\n• Inventory all cryptographic systems\n• Prioritise long-lived sensitive data\n• Begin migration to quantum-resistant algorithms (CRYSTALS-Kyber, CRYSTALS-Dilithium)",
        },
      ],
      quiz: [
        {
          id: "q5-1",
          question: "Why is a zero-day vulnerability particularly dangerous?",
          options: [
            "It can only be fixed by the attacker",
            "It is unknown to the vendor — there is no patch available when exploitation begins",
            "It only affects zero-day-old software",
            "It automatically spreads to all connected systems",
          ],
          correctIndex: 1,
          explanation: "A zero-day is dangerous because the vendor doesn't know about it yet — meaning there's no patch available. Defenders have zero days to prepare, while attackers can exploit it freely until the vendor discovers and patches it.",
          xp: 80,
        },
        {
          id: "q5-2",
          question: "What does 'Harvest Now, Decrypt Later' (HNDL) mean?",
          options: [
            "Attackers collect ransom payments and decrypt files later",
            "Attackers intercept encrypted data today and plan to decrypt it with future quantum computers",
            "A method of decrypting stolen data using AI",
            "A backup strategy for encrypted files",
          ],
          correctIndex: 1,
          explanation: "HNDL is a long-game strategy: nation-states collect encrypted communications today — even though they can't decrypt them yet — planning to use quantum computers in the future to retroactively decrypt sensitive data.",
          xp: 100,
        },
        {
          id: "q5-3",
          question: "Which type of data is at HIGHEST risk from the HNDL threat?",
          options: [
            "Today's cafeteria menu",
            "Shift rosters for this week",
            "Medical records and government classified documents",
            "Temporary login sessions",
          ],
          correctIndex: 2,
          explanation: "HNDL risk is based on data sensitivity horizon — how long the data stays sensitive. Medical records, government documents, and AI model weights remain sensitive for decades, making them prime targets for harvest-now attacks.",
          xp: 80,
        },
        {
          id: "q5-4",
          question: "What does NIST's FIPS 203/204/205 address?",
          options: [
            "Ransomware payment regulations",
            "Post-Quantum Cryptography standards",
            "AI usage in government systems",
            "Zero-day disclosure requirements",
          ],
          correctIndex: 1,
          explanation: "NIST's FIPS 203/204/205 standards (implemented in 2026) define Post-Quantum Cryptography algorithms that are resistant to quantum computer attacks. These replace current public-key systems like RSA that will become obsolete.",
          xp: 100,
        },
      ],
    },
  ],
};

export type { Chapter, LessonCard, QuizQuestion };
