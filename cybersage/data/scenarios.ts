import { Scenario } from "@/types";

export const scenarios: Scenario[] = [
  {
    id: "phishing-01",
    title: "The Suspicious Email",
    description: "You receive an urgent email at work. Time to decide.",
    context:
      'You\'re a junior analyst at FinSecure Bank. An email lands in your inbox at 8:47am:\n\n**From:** it-support@finsecure-helpdesk.net\n**Subject:** ⚠️ URGENT: Your account will be suspended in 2 hours\n\n"Dear Employee, Our security system detected unusual login activity on your account. Click the link below immediately to verify your identity or your access will be revoked. This cannot wait."\n\n[Verify Now → http://finsecure-helpd3sk.net/verify]',
    threat: "Phishing",
    difficulty: "beginner",
    category: "Social Engineering",
    hint: "Look closely at the sender domain and the URL. Are they exactly what you'd expect?",
    choices: [
      {
        id: "c1",
        text: "Click the link immediately — you can't afford to lose system access",
        isCorrect: false,
        feedback:
          "This is a phishing attack. The domain 'finsecure-helpdesk.net' is not the company's official domain, and 'finsecure-helpd3sk.net' uses a number '3' instead of 'e' — a classic typosquatting technique. Clicking would have handed your credentials to attackers.",
        xpGain: 0,
        nextScenarioId: null,
      },
      {
        id: "c2",
        text: "Forward the email to colleagues to warn them",
        isCorrect: false,
        feedback:
          "Good instinct to warn others, but forwarding a phishing email spreads the threat. You should report it to your security team directly, not forward it — others might accidentally click the link.",
        xpGain: 10,
        nextScenarioId: null,
      },
      {
        id: "c3",
        text: "Do not click — report to IT Security and verify via official channels",
        isCorrect: true,
        feedback:
          "Excellent decision. You identified multiple red flags: mismatched sender domain, typosquatted URL ('helpd3sk'), and artificial urgency. Reporting to IT Security and verifying through official channels is exactly the right protocol.",
        xpGain: 100,
        nextScenarioId: "access-control-01",
      },
      {
        id: "c4",
        text: "Reply to the email asking if it's legitimate",
        isCorrect: false,
        feedback:
          "Replying confirms your email is active and you're engaged — useful information for attackers. It also doesn't resolve the threat. Always verify through a separate, trusted communication channel.",
        xpGain: 15,
        nextScenarioId: null,
      },
    ],
  },
  {
    id: "access-control-01",
    title: "The Borrowed Badge",
    description: "A colleague needs access to a restricted area. What do you do?",
    context:
      "You're heading into the secure server room at FinSecure. A friendly colleague, James from Marketing, rushes up behind you:\n\n\"Hey! I left my badge at my desk — can you just let me in quickly? I need to drop off some documents for the CTO. Takes two seconds, I promise.\"\n\nJames has been at the company for 3 years. You've seen him in the office many times. The server room requires Level 3 clearance — Marketing typically has Level 1.",
    threat: "Physical Security / Tailgating",
    difficulty: "beginner",
    category: "Access Control",
    hint: "Think about why access levels exist, and what the right process is regardless of how well you know someone.",
    choices: [
      {
        id: "c1",
        text: "Let James in — you know him and it's just dropping off documents",
        isCorrect: false,
        feedback:
          "This is tailgating — a physical social engineering attack. Even if James is legitimate, you've created an unlogged, unauthorized entry. If something went wrong in that server room, there'd be no audit trail. Familiarity doesn't override access control.",
        xpGain: 0,
        nextScenarioId: null,
      },
      {
        id: "c2",
        text: "Tell James he needs to retrieve his badge or get proper clearance through official channels",
        isCorrect: true,
        feedback:
          "Correct. Access controls exist for everyone, regardless of seniority or familiarity. You should direct James to retrieve his badge, contact his manager for temporary access, or have IT issue emergency credentials. Being firm but polite is the right call.",
        xpGain: 100,
        nextScenarioId: "incident-response-01",
      },
      {
        id: "c3",
        text: "Let him in but stay with him the entire time",
        isCorrect: false,
        feedback:
          "While staying with an unauthorized visitor is better than leaving them alone, the entry itself is still unlogged and violates access policy. What if James is conducting reconnaissance and your presence was his plan all along?",
        xpGain: 25,
        nextScenarioId: null,
      },
      {
        id: "c4",
        text: "Call security to escort James while you hold the door",
        isCorrect: false,
        feedback:
          "Calling security is the right instinct, but holding the door open for James before security arrives still grants unauthorized access. Wait for security to arrive before the door opens.",
        xpGain: 40,
        nextScenarioId: null,
      },
    ],
  },
  {
    id: "incident-response-01",
    title: "System Under Attack",
    description: "Ransomware is spreading through the network. Every second counts.",
    context:
      "It's 2:13pm. Your monitoring dashboard lights up red. Alerts cascade:\n\n```\n[ALERT] Unusual file encryption detected on FINANCE-SRV-04\n[ALERT] Lateral movement detected: 3 workstations affected\n[ALERT] Known ransomware signature: LockBit variant\n[CRITICAL] C2 beacon detected — active exfiltration in progress\n```\n\nYou have admin access to the network. The finance server contains this quarter's unencrypted payroll data. The attack has been active for approximately 6 minutes.",
    threat: "Ransomware / Active Incident",
    difficulty: "intermediate",
    category: "Incident Response",
    hint: "In active incidents, containment comes before eradication. What's the fastest way to stop lateral spread?",
    choices: [
      {
        id: "c1",
        text: "Immediately shut down all servers to stop the encryption",
        isCorrect: false,
        feedback:
          "Shutting down all servers destroys volatile memory evidence needed for forensics, may corrupt partially-encrypted files making recovery harder, and causes maximum business disruption. Targeted isolation is always preferred over a full shutdown.",
        xpGain: 20,
        nextScenarioId: null,
      },
      {
        id: "c2",
        text: "Pay the ransom quickly — the payroll data is critical",
        isCorrect: false,
        feedback:
          "Paying ransom funds criminal operations, doesn't guarantee data recovery (only ~65% success rate), and marks your organisation as a 'payer' — making you a prime target for future attacks. This violates most security frameworks including NIST and ISO 27001.",
        xpGain: 0,
        nextScenarioId: null,
      },
      {
        id: "c3",
        text: "Isolate affected systems from the network, preserve logs, activate the incident response plan",
        isCorrect: true,
        feedback:
          "Textbook incident response. Network isolation (containment) stops lateral movement. Preserving logs maintains the forensic chain of evidence. Activating the IR plan brings in the right people — Legal, Comms, Executive — immediately. You've minimized damage while keeping recovery options open.",
        xpGain: 150,
        nextScenarioId: null,
      },
      {
        id: "c4",
        text: "Start manually deleting the ransomware files you can find",
        isCorrect: false,
        feedback:
          "Modern ransomware has persistence mechanisms — manually deleting visible files rarely removes the threat and often triggers failsafes. You'd also be destroying evidence and potentially spreading the infection through your own actions on infected systems.",
        xpGain: 10,
        nextScenarioId: null,
      },
    ],
  },
];

export function getScenarioById(id: string): Scenario | undefined {
  return scenarios.find((s) => s.id === id);
}

export function getScenariosByDifficulty(
  difficulty: Scenario["difficulty"]
): Scenario[] {
  return scenarios.filter((s) => s.difficulty === difficulty);
}
