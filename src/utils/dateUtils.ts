export interface ParsedDeadline {
  daysLeft: number;
  hoursLeft: number;
  isExpired: boolean;
  formattedText: string;
  urgency: "normal" | "soon" | "critical" | "expired";
}

/**
 * Parses Kaggle competition deadline timestamps into formatted countdowns and urgency levels.
 *
 * @param deadlineStr - Raw deadline string from Kaggle CLI / API (e.g. "2026-10-15 23:59:00" or ISO string)
 * @returns ParsedDeadline object containing countdown details and urgency classification
 */
export function parseKaggleDeadline(
  deadlineStr?: string | null,
): ParsedDeadline {
  if (!deadlineStr || deadlineStr.trim() === "") {
    return {
      daysLeft: 0,
      hoursLeft: 0,
      isExpired: false,
      formattedText: "Ongoing / No date",
      urgency: "normal",
    };
  }

  // Normalize common Kaggle CLI date representations
  const normalizedStr = deadlineStr.includes("T")
    ? deadlineStr
    : deadlineStr.replace(" ", "T");
  const targetDate = new Date(normalizedStr);
  const now = new Date();

  // Handle invalid date strings
  if (isNaN(targetDate.getTime())) {
    return {
      daysLeft: 0,
      hoursLeft: 0,
      isExpired: false,
      formattedText: deadlineStr,
      urgency: "normal",
    };
  }

  const diffMs = targetDate.getTime() - now.getTime();

  // Expired / Closed competition
  if (diffMs <= 0) {
    return {
      daysLeft: 0,
      hoursLeft: 0,
      isExpired: true,
      formattedText: "Closed",
      urgency: "expired",
    };
  }

  const totalHours = Math.floor(diffMs / (1000 * 60 * 60));
  const daysLeft = Math.floor(totalHours / 24);
  const hoursLeft = totalHours % 24;

  let urgency: ParsedDeadline["urgency"] = "normal";
  if (daysLeft <= 2) {
    urgency = "critical";
  } else if (daysLeft <= 7) {
    urgency = "soon";
  }

  let formattedText: string;
  if (daysLeft > 0) {
    formattedText = `${daysLeft}d ${hoursLeft}h left`;
  } else if (hoursLeft > 0) {
    formattedText = `${hoursLeft}h left`;
  } else {
    const minutesLeft = Math.max(1, Math.floor(diffMs / (1000 * 60)));
    formattedText = `${minutesLeft}m left`;
    urgency = "critical";
  }

  return {
    daysLeft,
    hoursLeft,
    isExpired: false,
    formattedText,
    urgency,
  };
}
