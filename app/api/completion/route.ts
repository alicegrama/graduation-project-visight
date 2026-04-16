import OpenAI from "openai";
import { NextRequest, NextResponse } from "next/server";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const PERSONAS: Record<string, {
  name: string;
  gender: string;
  ageBracket: string;
  techLiteracy: string;
  device: string;
  backstory: string;
}> = {
  maya: {
    name: "Maya",
    gender: "female",
    ageBracket: "20s",
    techLiteracy: "high",
    device: "phone",
    backstory: "Digital native, uses apps daily, fast-paced and goal-oriented.",
  },
  david: {
    name: "David",
    gender: "male",
    ageBracket: "60s",
    techLiteracy: "low",
    device: "phone",
    backstory: "Rarely uses apps, prefers desktop or in-person. Takes time to read everything carefully.",
  },
};

const CONDITION_DESCRIPTIONS: Record<string, string> = {
  deuteranopia: "red-green color blindness (cannot distinguish red from green)",
  protanopia: "red-blind color vision deficiency (reds appear dark, confusion with greens)",
  tritanopia: "blue-yellow color blindness (difficulty with blues and yellows)",
  achromatopsia: "complete color blindness (sees only in shades of grey)",
  cataracts: "cloudy lens causing blurred vision, reduced contrast, and glare sensitivity",
  glaucoma: "tunnel vision with peripheral vision loss, only central vision remains",
  low_vision: "general low vision with blurred sight and reduced contrast sensitivity",
  macular_degeneration: "central vision loss with a blind spot in the center of the visual field",
  hyperopia: "refractive error causing blurred near or distant vision due to inability to focus",
  contrast_sensitivity: "reduced ability to distinguish between similar shades, causing low-contrast elements to appear invisible",
  double_vision: "diplopia causing objects to appear duplicated side by side",
  glare: "light sensitivity causing bright areas to bloom and bleed, making high-contrast interfaces painful and unreadable",
  detail_loss: "loss of fine visual detail causing the world to appear pixelated or clustered",
};

async function detectVisualElements(
  transformedImageBase64: string,
  persona: typeof PERSONAS[string],
  condition: string,
  severity: number
): Promise<{
  detectedElements: string[];
  screenDescription: string;
}> {
  const conditionDescription = CONDITION_DESCRIPTIONS[condition] ?? condition;
  const severityLabel = severity >= 0.8 ? "severe" : severity >= 0.5 ? "moderate" : "mild";

  const response = await openai.chat.completions.create({
    model: "gpt-4o",
    max_tokens: 400,
    messages: [
      {
        role: "system",
        content: `You are simulating the visual perception of ${persona.name}, a user with ${severityLabel} ${conditionDescription}.
The image has already been transformed to simulate this condition.
Your job is to describe what interactive elements ${persona.name} can perceive on this screen.
Respond ONLY with valid JSON. No explanation outside the JSON.`,
      },
      {
        role: "user",
        content: [
          {
            type: "image_url",
            image_url: {
              url: `data:image/png;base64,${transformedImageBase64}`,
              detail: "high",
            },
          },
          {
            type: "text",
            text: `Looking at this screen through the eyes of ${persona.name} with ${severityLabel} ${conditionDescription}:

1. What elements look like they could be tapped, clicked, or interacted with? List only what ${persona.name} can actually perceive given their visual condition.
2. Briefly describe the overall screen.

Respond with:
{
  "detectedElements": ["element description 1", "element description 2", ...],
  "screenDescription": "brief description of what ${persona.name} perceives"
}`,
          },
        ],
      },
    ],
  });

  const raw = response.choices[0].message.content ?? "{}";
  const cleaned = raw.replace(/```json|```/g, "").trim();

  try {
    return JSON.parse(cleaned);
  } catch {
    return { detectedElements: [], screenDescription: "Could not parse screen." };
  }
}

function crossReferenceElements(
  detectedElements: string[],
  interactiveElements: { index: number; name: string; position: string; destinationId: string }[]
): {
  matched: { detected: string; wired: typeof interactiveElements[0] }[];
  detectedButNotWired: string[];
  wiredButNotDetected: typeof interactiveElements[number][];
} {
  const matched: { detected: string; wired: typeof interactiveElements[0] }[] = [];
  const detectedButNotWired: string[] = [];
  const matchedWiredIndices = new Set<number>();

  for (const detected of detectedElements) {
    const detectedLower = detected.toLowerCase();

    const match = interactiveElements.find((el, idx) => {
      if (matchedWiredIndices.has(idx)) return false;
      const elNameLower = el.name.toLowerCase();
      const detectedWords = detectedLower.split(/\s+/).filter((w: string) => w.length > 3);
      return (
        detectedLower.includes(elNameLower) ||
        elNameLower.includes(detectedLower) ||
        detectedWords.some((word: string) => elNameLower.includes(word))
      );
    });

    if (match) {
      const idx = interactiveElements.indexOf(match);
      matchedWiredIndices.add(idx);
      matched.push({ detected, wired: match });
    } else {
      detectedButNotWired.push(detected);
    }
  }

  const wiredButNotDetected = interactiveElements.filter(
    (_, idx) => !matchedWiredIndices.has(idx)
  );

  return { matched, detectedButNotWired, wiredButNotDetected };
}

async function runTraversalStep(
  transformedImageBase64: string,
  interactiveElements: { index: number; name: string; position: string }[],
  persona: typeof PERSONAS[string],
  condition: string,
  severity: number,
  task: string,
  stepNumber: number,
  frameName: string,
  history: string[],
  screenDescription: string,
  detectedButNotWired: string[],
  wiredButNotDetected: { index: number; name: string; position: string }[]
): Promise<{
  choice: number | null;
  reasoning: string;
  confidence: string;
  outcome: "continue" | "completed" | "abandon" | "cannot_find_target";
}> {
  const conditionDescription = CONDITION_DESCRIPTIONS[condition] ?? condition;
  const severityLabel = severity >= 0.8 ? "severe" : severity >= 0.5 ? "moderate" : "mild";

  const elementsText = interactiveElements.length > 0
    ? interactiveElements
        .map((el) => `[${el.index}] "${el.name}" — ${el.position}`)
        .join("\n")
    : "No interactive elements detected on this screen.";

  const crossRefContext = [
    detectedButNotWired.length > 0
      ? `⚠ ${persona.name} can see these elements but they lead nowhere (dead ends): ${detectedButNotWired.join(", ")}`
      : "",
    wiredButNotDetected.length > 0
  ? `⚠ ${wiredButNotDetected.length} interactive element(s) exist on this screen but are not visible to ${persona.name} due to their visual condition. ${persona.name} cannot use these elements.`
  : "",
  ].filter(Boolean).join("\n");

  const historyText = history.length > 0
    ? `\nYour journey so far:\n${history.map((h, i) => `Step ${i + 1}: ${h}`).join("\n")}`
    : "";

  const systemPrompt = `You are simulating a real user navigating a mobile/desktop UI prototype.

PERSONA:
- Name: ${persona.name}
- Age bracket: ${persona.ageBracket}
- Tech literacy: ${persona.techLiteracy}
- Device: ${persona.device}
- Background: ${persona.backstory}

VISUAL CONDITION:
- ${persona.name} has ${severityLabel} ${conditionDescription}.
- Severity level: ${Math.round(severity * 100)}%. At low severity (under 30%), the visual impairment has minimal effect and the user can see the screen almost normally. At moderate severity (30-70%), some elements may be harder to perceive. At high severity (above 70%), significant parts of the screen may be imperceptible.
- The image you are seeing has already been visually transformed to simulate this exact severity level. Trust what you can see in the image — do not assume impairment beyond what is visible in the transformed image.
- Reason about what ${persona.name} can and cannot perceive based PRIMARILY on the transformed image, not on assumptions about the condition.

TASK:
${persona.name} is trying to: "${task}"

RULES:
- You must ALWAYS choose ONE interactive element to tap. Real users do not give up easily.
- Choose abandon ONLY as a last resort: if you have already tried multiple elements and made no progress, OR if the screen is completely black or blank with nothing perceivable at all.
- A real user with a visual impairment will make their best guess even when uncertain. Low confidence is not a reason to abandon, it is a reason to guess.
- If you cannot clearly read a label, tap whatever element seems most likely based on its position, shape, or partial visibility.
- Choose cannot_find_target if: you can describe what you want to tap but it genuinely does not appear anywhere in the interactive elements list.
- You have a maximum of 10 steps. Only abandon if you have been going in circles with no progress for several steps.
- Set outcome to "completed" ONLY if the screen you are CURRENTLY LOOKING AT right now visually matches the task goal. Do not complete based on what you expect to see after tapping — only based on what you can see right now.
- You cannot declare completion because you tapped something that should lead to the goal. You must actually be on the goal screen already to declare completion.
- If an element is listed as wired but imperceptible, treat it as if it does not exist. Do not tap it, do not reference it, do not infer its position from prior knowledge. You can only interact with elements you can actually perceive in the image.
- When unsure whether the current screen matches the goal, choose "continue".
- Do not continue navigating after the goal is achieved.

- Respond ONLY with valid JSON. No explanation outside the JSON.

RESPONSE FORMAT:
{
  "choice": <number from the list, or null if abandoning or completed>,
  "reasoning": "<explain what ${persona.name} perceives and why they make this choice>",
  "confidence": "<high | medium | low>",
  "outcome": "<continue | completed | abandon | cannot_find_target>"
}`;

const userPrompt = `This is step ${stepNumber} of your navigation.${historyText}

Current screen: "${frameName}"
What ${persona.name} perceives: ${screenDescription}

Interactive elements ${persona.name} can both see AND tap:
${elementsText}

${crossRefContext}

Important: ${persona.name} is currently ON "${frameName}". Do not tap elements that navigate back to the current screen or to already-visited screens. Choose the element most likely to move toward the task goal.

What does ${persona.name} do?`;

  const response = await openai.chat.completions.create({
    model: "gpt-4o",
    max_tokens: 300,
    messages: [
      { role: "system", content: systemPrompt },
      {
        role: "user",
        content: [
          {
            type: "image_url",
            image_url: {
              url: `data:image/png;base64,${transformedImageBase64}`,
              detail: "high",
            },
          },
          { type: "text", text: userPrompt },
        ],
      },
    ],
  });

  const raw = response.choices[0].message.content ?? "{}";
  const cleaned = raw.replace(/```json|```/g, "").trim();

  try {
    return JSON.parse(cleaned);
  } catch {
    return {
      choice: null,
      reasoning: "Failed to parse model response.",
      confidence: "low",
      outcome: "abandon",
    };
  }
}

async function generateNarrative(
  persona: typeof PERSONAS[string],
  condition: string,
  severity: number,
  task: string,
  sessionTrace: {
    step: number;
    frameName: string;
    choice: string;
    reasoning: string;
    confidence: string;
    outcome: string;
  }[],
  finalOutcome: "completion" | "failure" | "dropout"
): Promise<string> {
  const severityLabel = severity >= 0.8 ? "severe" : severity >= 0.5 ? "moderate" : "mild";
  const conditionDescription = CONDITION_DESCRIPTIONS[condition] ?? condition;

  const traceText = sessionTrace
    .map(
      (s) =>
        `Step ${s.step} (${s.frameName}): ${s.reasoning} → chose: "${s.choice}" [${s.confidence} confidence]`
    )
    .join("\n\n");

  const outcomeText = {
    completion: `${persona.name} successfully completed the task.`,
    failure: `${persona.name} reached a dead end and could not complete the task.`,
    dropout: `${persona.name} abandoned the task due to excessive friction or confusion.`,
  }[finalOutcome];

  const prompt = `You are an accessibility expert writing a structured evaluation report for a UI/UX designer.

A simulated user navigated a UI prototype. Here is their profile and what happened:

PERSONA: ${persona.name}, ${persona.ageBracket}, ${persona.techLiteracy} tech literacy, using a ${persona.device}.
CONDITION: ${severityLabel} ${conditionDescription}.
TASK: "${task}"
FINAL OUTCOME: ${outcomeText}

NAVIGATION TRACE:
${traceText}

Return a JSON object with this exact structure. No markdown, no code fences, just raw JSON:
{
  "summary": "2-3 sentence overview of what the simulated user experienced and the overall accessibility outcome",
  "outcome": "${finalOutcome}",
  "issues": [
    {
      "severity": "critical" | "major" | "minor",
      "screen": "name of the screen where the issue occurred",
      "issue": "concise description of the accessibility problem (1-2 sentences)",
      "recommendation": "specific actionable fix the designer can implement (1-2 sentences)"
    }
  ]
}

Severity guide:
- critical: blocked the user from completing the task entirely
- major: caused significant confusion, wrong navigation, or multiple failed attempts  
- minor: caused hesitation or uncertainty but did not prevent task completion

Identify between 2 and 6 issues. Focus on issues caused by the visual condition, not general UX problems. Each issue must reference a specific screen from the navigation trace.`;

  const response = await openai.chat.completions.create({
    model: "gpt-4o",
    max_tokens: 1200,
    messages: [{ role: "user", content: prompt }],
  });

  return response.choices[0].message.content ?? "{}";
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { personaKey, condition, severity, task, steps } = body;

    const persona = PERSONAS[personaKey] ?? PERSONAS.maya;
    const sessionTrace: {
      step: number;
      frameName: string;
      choice: string;
      reasoning: string;
      confidence: string;
      outcome: string;
      detectedElements?: string[];
      detectedButNotWired?: string[];
      wiredButNotDetected?: string[];
    }[] = [];

    const history: string[] = [];
    const MAX_STEPS = 10;
    const frameMap = new Map<string, any>(steps.map((s: any) => [s.frameId, s]));
    let currentStep = steps[0];
    let finalOutcome: "completion" | "failure" | "dropout" = "dropout";
    let stoppedAtStep = 0;

    for (let stepNumber = 1; stepNumber <= MAX_STEPS; stepNumber++) {
      const step = currentStep;

      const { detectedElements, screenDescription } = await detectVisualElements(
        step.transformedImageBase64,
        persona,
        condition,
        severity
      );

      const { matched, detectedButNotWired, wiredButNotDetected } = crossReferenceElements(
        detectedElements,
        step.interactiveElements
      );

      if (detectedElements.length === 0) {
        sessionTrace.push({
          step: stepNumber,
          frameName: step.frameName,
          choice: "nothing",
          reasoning: `${persona.name} cannot perceive any interactive elements on this screen due to their visual condition.`,
          confidence: "high",
          outcome: "abandon",
          detectedElements: [],
          detectedButNotWired: [],
          wiredButNotDetected: [],
        });
        finalOutcome = "dropout";
        stoppedAtStep = stepNumber;
        break;
      }

      const result = await runTraversalStep(
  step.transformedImageBase64,
  matched.map((m: any) => m.wired),
  persona,
  condition,
  severity,
  task,
  stepNumber,
  step.frameName,
  history,
  screenDescription,
  detectedButNotWired,
  wiredButNotDetected
);

      const chosenElement = result.choice !== null
        ? step.interactiveElements.find((el: any) => el.index === result.choice)
        : null;

      const chosenName = chosenElement?.name ?? "nothing";

      sessionTrace.push({
        step: stepNumber,
        frameName: step.frameName,
        choice: chosenName,
        reasoning: result.reasoning,
        confidence: result.confidence,
        outcome: result.outcome,
        detectedElements,
        detectedButNotWired,
        wiredButNotDetected: wiredButNotDetected.map((e: any) => e.name),
      });

      history.push(`On "${step.frameName}", tapped "${chosenName}". ${result.reasoning}`);

      if (result.outcome === "completed") {
        finalOutcome = "completion";
        stoppedAtStep = stepNumber;
        break;
      }

      if (result.outcome === "abandon") {
        finalOutcome = "dropout";
        stoppedAtStep = stepNumber;
        break;
      }

      if (result.outcome === "cannot_find_target") {
        finalOutcome = "failure";
        stoppedAtStep = stepNumber;
        break;
      }

      // Dynamic navigation: follow the chosen button's actual wiring
      const nextFrameId = chosenElement?.destinationId;
      const nextStep = nextFrameId ? frameMap.get(nextFrameId) : null;
      if (!nextStep) {
        finalOutcome = "failure";
        stoppedAtStep = stepNumber;
        break;
      }
      currentStep = nextStep;
    }

    const narrative = await generateNarrative(
      persona,
      condition,
      severity,
      task,
      sessionTrace,
      finalOutcome
    );

    return NextResponse.json({
      sessionTrace,
      finalOutcome,
      stoppedAtStep,
      narrative,
      personaName: persona.name,
    });
  } catch (err: any) {
    console.error("Traversal error:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}