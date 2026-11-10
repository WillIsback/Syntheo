// Textes anglais des modèles fournis : ceux de la migration
// `crates/db-app/migrations/20260524000000_default_templates.sql` pour les
// modèles `default-*`, et la traduction des quatre modèles `syntheo-*`.
import type { DefaultTemplateText } from "./default-templates-locale";

export const DEFAULT_TEMPLATES_EN: Readonly<
  Record<string, DefaultTemplateText>
> = {
  "default-board-meeting": {
    title: "Board Meeting",
    description: "For board meetings and governance discussions",
    category: "Leadership",
    targets: ["Founder", "CEO", "Board Member"],
    sections: [
      ["Company Performance", "Financial and operational updates"],
      ["Strategic Initiatives", "Progress on key strategic priorities"],
      ["Financial Review", "Budget, runway, and financial health"],
      ["Board Decisions", "Resolutions and governance matters"],
      ["Risk & Compliance", "Risk management and compliance updates"],
      ["Next Steps", "Action items and follow-ups"],
    ],
  },
  "default-brainstorming-session": {
    title: "Brainstorming Session",
    description: "For creative brainstorming and ideation sessions",
    category: "Product",
    targets: ["Product Manager", "Designer", "Marketing"],
    sections: [
      ["Session Goal", "What problem or opportunity are we exploring?"],
      ["Ideas Generated", "All ideas captured during brainstorming"],
      ["Promising Concepts", "Ideas worth exploring further"],
      ["Evaluation Criteria", "How we'll assess ideas"],
      ["Next Steps", "Action items to move forward"],
    ],
  },
  "default-client-kickoff": {
    title: "Client Kickoff Meeting",
    description: "For starting new client engagements and setting expectations",
    category: "Customer Success",
    targets: [
      "Customer Success Manager",
      "Account Manager",
      "Implementation Lead",
    ],
    sections: [
      ["Project Overview", "Scope, objectives, and deliverables"],
      ["Team Introductions", "Roles and responsibilities"],
      ["Timeline & Milestones", "Project schedule and key dates"],
      ["Communication Plan", "Meeting cadence and updates"],
      ["Success Criteria", "How we measure project success"],
      ["Next Steps", "Immediate action items"],
    ],
  },
  "default-customer-discovery": {
    title: "Customer Discovery Interview",
    description:
      "For conducting customer discovery and user research interviews",
    category: "Product",
    targets: ["Product Manager", "UX Researcher", "Founder"],
    sections: [
      ["Background", "Customer context and background"],
      ["Current Process", "How they currently solve the problem"],
      ["Pain Points", "Challenges and frustrations"],
      ["Needs & Goals", "What they're trying to achieve"],
      ["Feedback on Solution", "Reactions to proposed solution"],
      ["Key Insights", "Main takeaways and learnings"],
    ],
  },
  "default-daily-standup": {
    title: "Daily Standup",
    description: "For quick daily syncs to share progress and blockers",
    category: "Engineering",
    targets: ["Software Engineer", "Engineering Manager", "Scrum Master"],
    sections: [
      ["Yesterday's Accomplishments", "What did you complete yesterday?"],
      ["Today's Plan", "What are you working on today?"],
      ["Blockers", "Any obstacles or help needed?"],
      ["Team Updates", "Important announcements or information"],
    ],
  },
  "default-executive-briefing": {
    title: "Executive Briefing",
    description: "For capturing high-level strategic discussions and decisions",
    category: "Leadership",
    targets: ["Executive", "CEO", "VP"],
    sections: [
      ["Strategic Overview", "High-level context and objectives"],
      ["Key Metrics", "Performance indicators and trends"],
      ["Major Decisions", "Strategic decisions and rationale"],
      ["Resource Allocation", "Budget and resource commitments"],
      ["Risks & Opportunities", "Strategic risks and growth opportunities"],
      ["Action Items", "Executive-level follow-ups"],
    ],
  },
  "default-incident-postmortem": {
    title: "Incident Postmortem",
    description:
      "For conducting blameless postmortems after incidents or outages",
    category: "Engineering",
    targets: ["Platform Engineer", "SRE", "DevOps Engineer"],
    sections: [
      ["Incident Summary", "What happened and when"],
      ["Timeline of Events", "Chronological sequence of events"],
      ["Root Cause Analysis", "What caused the incident"],
      ["Impact Assessment", "Effect on users and business"],
      ["Response & Resolution", "How the incident was resolved"],
      ["Lessons Learned", "Key takeaways and insights"],
      ["Action Items", "Preventive measures and improvements"],
    ],
  },
  "default-investor-pitch": {
    title: "Investor Pitch Meeting",
    description: "For pitching to investors and VCs",
    category: "Fundraising",
    targets: ["Founder", "CEO", "CFO"],
    sections: [
      ["Meeting Context", "Investor background and meeting purpose"],
      ["Pitch Summary", "Key points presented"],
      ["Questions Asked", "Investor questions and concerns"],
      ["Feedback Received", "Investor reactions and feedback"],
      ["Investment Interest", "Level of interest and next steps"],
      ["Follow-up Items", "Information requested and action items"],
    ],
  },
  "default-lecture-notes": {
    title: "Lecture Notes",
    description: "For capturing and organizing lecture content",
    category: "Education",
    targets: ["Student", "Graduate Student", "Researcher"],
    sections: [
      ["Lecture Information", "Course, date, and topic"],
      ["Key Concepts", "Main ideas and theories covered"],
      ["Important Definitions", "Terms and definitions to remember"],
      ["Examples & Applications", "Examples and real-world applications"],
      ["Questions & Clarifications", "Items to follow up on"],
      ["Action Items", "Homework and next steps"],
    ],
  },
  "default-one-on-one-meeting": {
    title: "1:1 Meeting",
    description: "For structured one-on-one meetings with team members",
    category: "Management",
    targets: ["Manager", "Engineering Manager", "Team Lead"],
    sections: [
      ["Updates", "What's been happening since last time?"],
      ["Wins & Challenges", "Celebrate successes and discuss obstacles"],
      ["Goals & Progress", "Review current goals and track progress"],
      ["Feedback", "Two-way feedback exchange"],
      ["Action Items", "Next steps and commitments"],
    ],
  },
  "default-performance-review": {
    title: "Performance Review",
    description:
      "For conducting employee performance reviews and career development discussions",
    category: "Management",
    targets: ["Manager", "Engineering Manager", "HR"],
    sections: [
      ["Review Period Summary", "Overview of the review period"],
      ["Key Accomplishments", "Major achievements and contributions"],
      ["Areas of Strength", "Skills and behaviors to continue"],
      ["Areas for Development", "Growth opportunities and improvements"],
      ["Career Goals", "Career aspirations and development path"],
      ["Action Plan", "Development goals and next steps"],
    ],
  },
  "default-product-roadmap-review": {
    title: "Product Roadmap Review",
    description: "For reviewing and aligning on product roadmap priorities",
    category: "Product",
    targets: ["Product Manager", "Engineering Manager", "Executive"],
    sections: [
      ["Current Status", "Progress on in-flight initiatives"],
      ["Upcoming Features", "Next quarter priorities and timeline"],
      ["Customer Feedback", "Key insights from users and customers"],
      ["Success Metrics", "KPIs and measurement approach"],
      ["Resource Allocation", "Team assignments and capacity"],
      ["Decisions Made", "Key decisions and trade-offs"],
    ],
  },
  "default-project-kickoff": {
    title: "Project Kickoff",
    description:
      "For starting new projects with clear objectives and alignment",
    category: "Product",
    targets: ["Product Manager", "Engineering Manager", "Designer"],
    sections: [
      ["Project Overview", ""],
      ["Goals & Success Metrics", "Define what success looks like"],
      ["Stakeholders & Roles", ""],
      ["Timeline & Milestones", ""],
      ["Risks & Dependencies", ""],
      ["Next Steps", ""],
    ],
  },
  "default-sales-discovery-call": {
    title: "Sales Discovery Call",
    description: "For qualifying leads and understanding customer needs",
    category: "Sales",
    targets: ["Account Executive", "Sales Rep", "BDR"],
    sections: [
      ["Company Overview", "Background on the prospect"],
      ["Current Situation", "How they operate today"],
      ["Challenges & Pain Points", "Problems they're trying to solve"],
      ["Goals & Success Criteria", "What success looks like"],
      ["Budget & Timeline", "Financial and timing constraints"],
      ["Next Steps", "Follow-up actions and timeline"],
    ],
  },
  "default-sprint-planning": {
    title: "Sprint Planning",
    description: "For planning development sprints and setting team goals",
    category: "Engineering",
    targets: ["Engineering Manager", "Product Manager", "Tech Lead"],
    sections: [
      ["Sprint Goal", "What is the main objective for this sprint?"],
      ["Sprint Backlog", "Stories and tasks committed for the sprint"],
      ["Capacity & Availability", "Team availability and capacity estimates"],
      ["Dependencies & Risks", "External dependencies and potential risks"],
      ["Definition of Done", "Acceptance criteria and completion standards"],
    ],
  },
  "default-sprint-retrospective": {
    title: "Sprint Retrospective",
    description:
      "For reflecting on sprints to continuously improve team processes and collaboration",
    category: "Engineering",
    targets: ["Engineering Manager", "Scrum Master", "Tech Lead"],
    sections: [
      ["What Went Well", "Celebrate wins and positive outcomes"],
      ["What Didn't Go Well", "Identify challenges and problems"],
      ["What We Learned", "Key insights and takeaways"],
      ["Action Items", "Concrete steps for improvement"],
    ],
  },
  "default-technical-design-review": {
    title: "Technical Design Review",
    description: "For reviewing technical designs and architecture decisions",
    category: "Engineering",
    targets: ["Software Engineer", "Tech Lead", "Platform Engineer"],
    sections: [
      ["Problem Statement", "What problem are we solving?"],
      ["Proposed Solution", "Technical approach and architecture"],
      ["Alternatives Considered", "Other options and trade-offs"],
      ["Implementation Plan", "Breakdown of work and timeline"],
      ["Testing Strategy", "How we'll validate the solution"],
      ["Risks & Mitigation", "Potential issues and contingency plans"],
      ["Decisions & Action Items", "Outcomes and next steps"],
    ],
  },
  "syntheo-general": {
    title: "General meeting",
    description: "Standard summary: decisions and action items.",
    category: "General",
    targets: [],
    sections: [
      [
        "Participants",
        "List the meeting participants with their role if mentioned.",
      ],
      [
        "Decisions made",
        "Summarize the important decisions made during the meeting.",
      ],
      [
        "Action items",
        "List the actions to take, with the owner and deadline if mentioned.",
      ],
      ["Next step", "Describe the next step or the date of the next meeting."],
    ],
  },
  "syntheo-compliance": {
    title: "Compliance / GDPR committee",
    description: "Focused on risks, regulatory decisions and blockers.",
    category: "Compliance",
    targets: [],
    sections: [
      [
        "Context",
        "Summarize the regulatory context or the compliance topic discussed.",
      ],
      ["Decisions made", "List the regulatory or technical decisions made."],
      [
        "Blockers before production",
        "List the identified obstacles that prevent going to production.",
      ],
      [
        "Residual risks",
        "Identify the risks not yet addressed and their potential impact.",
      ],
      ["Next step", "Describe the immediate actions and the review date."],
    ],
  },
  "syntheo-project": {
    title: "Project / Sprint check-in",
    description: "Progress, blockers, upcoming deadlines.",
    category: "Project",
    targets: [],
    sections: [
      ["Progress", "Summarize the progress made since the last check-in."],
      [
        "Blockers",
        "List the current obstacles and their impact on the schedule.",
      ],
      ["Next steps", "List the priority tasks and deadlines."],
    ],
  },
  "syntheo-standup": {
    title: "Team standup",
    description: "Short format: done, in progress, blockers.",
    category: "Project",
    targets: [],
    sections: [
      [
        "Done",
        "For each speaker, summarize what was accomplished since the last standup.",
      ],
      ["In progress", "For each speaker, list today's tasks in progress."],
      ["Blockers", "List the reported blockers and their impact."],
    ],
  },
};
