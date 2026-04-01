import OpenAI from "openai";
import { NextRequest, NextResponse } from "next/server";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const PERSONAS: Record<string, {
  name: string;
  ageBracket: string;
  techLiteracy: string;
  device: string;
  backstory: string;
}> = {
  maya: {
    name: "Maya",
    ageBracket: "20s",
    techLiteracy: "high",
    device: "phone",
    backstory: "Digital native, uses apps daily, fast-paced and goal-oriented.",
  },
  david: {
    name: "David",
    ageBracket: "40s",
    techLiteracy: "medium",
    device: "phone",
    backstory: "Occasional app user, comfortable but not fluent with new interfaces.",
  },
  elena: {
    name: "Elena",
    ageBracket: "60s+",
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
      ? `⚠ These elements are interactive but ${persona.name} may not be able to perceive them: ${wiredButNotDetected.map(e => e.name).join(", ")}`
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
- The image you are seeing has already been visually transformed to simulate this condition.
- Reason about what ${persona.name} can and cannot perceive given both the transformed image AND the condition description.

TASK:
${persona.name} is trying to: "${task}"

RULES:
- You must choose ONE interactive element to tap, OR decide to abandon.
- Choose abandon if: you cannot confidently identify any useful tap target, or if the current screen is too confusing or inaccessible to proceed.
- Choose cannot_find_target if: you can identify what you want to tap but it does not appear in the interactive elements list.
- You have a maximum of 10 steps total. If the goal seems unreachable, abandon.
- If the element you are tapping IS the destination that completes the task (e.g. tapping "Rewards" when the task is "go to rewards page"), set outcome to "completed" immediately — do not wait to see the next screen.
- If you have successfully navigated to a screen that fulfills the task goal, set outcome to "completed".
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

What ${persona.name} perceives on this screen: ${screenDescription}

Interactive elements ${persona.name} can both see AND tap:
${elementsText}

${crossRefContext}

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

  const prompt = `You are writing a UX accessibility evaluation report for a designer.

A simulated user navigated a UI prototype. Here is their profile and what happened:

PERSONA: ${persona.name}, ${persona.ageBracket}, ${persona.techLiteracy} tech literacy, using a ${persona.device}.
CONDITION: ${severityLabel} ${conditionDescription}.
TASK: "${task}"
FINAL OUTCOME: ${outcomeText}

NAVIGATION TRACE:
${traceText}

Write a clear, human narrative (4–6 paragraphs) in second person addressed to the designer.
- Describe what ${persona.name} experienced at each key moment
- Be specific about which visual or interaction failures caused problems
- End with 3 prioritized, actionable recommendations
- Write for a designer audience, not a technical one
- Do NOT use bullet points for the main narrative, only for the final recommendations`;

  const response = await openai.chat.completions.create({
    model: "gpt-4o",
    max_tokens: 1000,
    messages: [{ role: "user", content: prompt }],
  });

  return response.choices[0].message.content ?? "Could not generate narrative.";
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
    let finalOutcome: "completion" | "failure" | "dropout" = "dropout";
    let stoppedAtStep = steps.length;

    for (let i = 0; i < steps.length; i++) {
      const step = steps[i];
      const stepNumber = i + 1;
      const isLastStep = i === steps.length - 1;

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

      if (isLastStep) {
        finalOutcome = "completion";
      }
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