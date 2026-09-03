import * as vscode from "vscode";
import * as fs from "fs";
import { KaggleCliService } from "./kaggleCli";
import { CredentialsManager } from "./credentialsManager";

export interface LeaderboardEntry {
  rank: string;
  teamName: string;
  score: string;
  entries: string;
  lastSubmission: string;
  isCurrentUser: boolean;
}

export interface CompetitionDetails {
  ref: string;
  title: string;
  url: string;
  deadlineRaw: string;
  category: string;
  reward: string;
  teamCount: string;
  userHasEntered: boolean;
  isExpired: boolean;
  daysLeft: number;
}

export class CompetitionService {
  public static extractCleanSlug(input: string): string {
    if (!input) return "";
    let clean = input.trim();

    // Regex handles /competitions/<slug>, /c/<slug>, subpaths, and query strings
    const urlMatch = clean.match(
      /kaggle\.com\/(?:competitions|c)\/([^/?#\s]+)/i,
    );
    if (urlMatch) {
      return urlMatch[1];
    }

    if (clean.includes("/")) {
      const parts = clean.split(/[?#]/)[0].split("/").filter(Boolean);
      return parts[parts.length - 1];
    }

    return clean.replace(/\/$/, "").split(/[?#]/)[0].trim();
  }

  /**
   * Filters out false/corrupted inputs such as leaked CSV headers, empty rows,
   * or CLI warnings/errors that were parsed as data records.
   */
  private static isValidLeaderboardRow(r: Record<string, string>): boolean {
    const values = Object.values(r).map((v) => v.trim());
    if (values.length === 0 || values.every((v) => v.length === 0)) {
      return false;
    }

    const teamName = (
      r.teamname ||
      r.team ||
      (values.length > 1 ? values[1] : "")
    )
      .toLowerCase()
      .trim();
    const score = (r.score || (values.length > 3 ? values[3] : ""))
      .toLowerCase()
      .trim();

    // 1. Filter out leaked header rows
    if (
      teamName === "teamname" ||
      teamName === "team" ||
      teamName === "team name" ||
      score === "score"
    ) {
      return false;
    }

    // 2. Filter out CLI notices, stack traces, and HTTP error strings
    if (
      teamName.startsWith("warning:") ||
      teamName.startsWith("error:") ||
      teamName.includes("401 unauthorized") ||
      teamName.includes("traceback") ||
      teamName.includes("no submissions")
    ) {
      return false;
    }

    return true;
  }

  /**
   * Determines if a leaderboard entry belongs to the current user without
   * false-positive substring hits (e.g. 'dan' matching 'Jordan' or 'Data Miners').
   */
  private static isMatchingUser(
    teamName: string,
    myUsername: string,
    record: Record<string, string>,
  ): boolean {
    if (!myUsername || myUsername.length === 0) {
      return false;
    }

    const cleanUser = myUsername.toLowerCase().trim();
    const cleanTeam = teamName.toLowerCase().trim();

    // 1. Exact match
    if (cleanTeam === cleanUser) {
      return true;
    }

    // 2. Dedicated member/username columns if provided in Kaggle CLI output
    const memberField =
      record.teammembers || record.members || record.username || record.user;
    if (memberField) {
      const members = memberField.toLowerCase().split(/[,&/|+]|\band\b/);
      if (members.some((m) => m.trim() === cleanUser)) {
        return true;
      }
    }

    // 3. Multi-member default team names (e.g. "user1, user2" or "user1 & user2")
    const teamTokens = cleanTeam.split(/[,&/|+]|\band\b/);
    if (teamTokens.some((t) => t.trim() === cleanUser)) {
      return true;
    }

    // 4. Strict boundary matching for usernames >= 3 characters (allows "Username's Team")
    // Rejects matches within alphanumeric, underscore, or hyphen sequences (e.g. rejects "super_dan")
    if (cleanUser.length >= 3) {
      const escaped = cleanUser.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const boundaryRegex = new RegExp(
        `(^|[^a-z0-9_-])${escaped}([^a-z0-9_-]|$)`,
        "i",
      );
      return boundaryRegex.test(teamName);
    }

    return false;
  }

  /**
   * Parses the CSV from `kaggle competitions leaderboard <slug> -s --csv`.
   * Standard columns: teamId, teamName, submissionDate, score
   */
  public static async getLeaderboard(
    competitionSlug: string,
  ): Promise<{ topEntries: LeaderboardEntry[]; userEntry?: LeaderboardEntry }> {
    const cleanSlug = this.extractCleanSlug(competitionSlug);
    if (!cleanSlug) {
      return { topEntries: [] };
    }

    let raw = "";
    try {
      raw = await KaggleCliService.execute([
        "competitions",
        "leaderboard",
        cleanSlug,
        "-s",
        "--csv",
      ]);
    } catch {
      return { topEntries: [] };
    }

    const records = KaggleCliService.parseCsv(raw);
    const creds = CredentialsManager.inspectCredentials();
    const myUsername = (creds.username || "").trim().toLowerCase();

    const topEntries: LeaderboardEntry[] = [];
    let userEntry: LeaderboardEntry | undefined;

    // Filter out invalid/corrupted records before ranking
    const validRecords = records.filter((r) => this.isValidLeaderboardRow(r));

    validRecords.forEach((r, idx) => {
      const values = Object.values(r);

      const teamName =
        r.teamname || r.team || (values.length > 1 ? values[1] : "Team");
      const score = r.score || (values.length > 3 ? values[3] : "");
      const submissionDate =
        r.submissiondate ||
        r.lastsubmission ||
        (values.length > 2 ? values[2] : "");
      const entries = r.entries || r.submissioncount || "1";
      const rank = r.rank || r.place || (idx + 1).toString();

      const isCurrentUser = this.isMatchingUser(teamName, myUsername, r);

      const entry: LeaderboardEntry = {
        rank: rank.trim(),
        teamName: teamName.trim(),
        score: score.trim(),
        entries: entries.trim(),
        lastSubmission: submissionDate.trim(),
        isCurrentUser,
      };

      if (idx < 25) {
        topEntries.push(entry);
      }

      if (isCurrentUser && !userEntry) {
        userEntry = entry;
      }
    });

    return { topEntries, userEntry };
  }

  private static parseUserHasEntered(val?: string): boolean {
    if (!val) return false;
    const clean = val.trim().toLowerCase();
    return clean === "true" || clean === "1" || clean === "yes";
  }

  /**
   * Sorts competitions so active ones (!isExpired) are always on top (sorted by
   * closest deadline first), followed by completed/expired ones (sorted by most recently ended).
   */
  private static sortCompetitions(
    a: CompetitionDetails,
    b: CompetitionDetails,
  ): number {
    if (a.isExpired !== b.isExpired) {
      return a.isExpired ? 1 : -1; // Active first
    }

    if (!a.isExpired) {
      return a.daysLeft - b.daysLeft; // Soonest deadline first
    }

    const timeA = new Date(a.deadlineRaw).getTime() || 0;
    const timeB = new Date(b.deadlineRaw).getTime() || 0;
    return timeB - timeA; // Most recently closed first
  }

  private static parseRecordToDetails(
    r: Record<string, string>,
    now: Date,
    forcedUserEntered?: boolean,
  ): CompetitionDetails | null {
    const slug = this.extractCleanSlug(r.ref || r.url || r.title);
    if (!slug) return null;

    const deadlineStr = r.deadline || r.deadlinedate || "";
    const deadlineDate = new Date(deadlineStr);
    const hasValidDeadline = !isNaN(deadlineDate.getTime());
    const isExpired =
      hasValidDeadline && deadlineDate.getTime() < now.getTime();

    const diffMs = hasValidDeadline
      ? deadlineDate.getTime() - now.getTime()
      : 0;
    const daysLeft = Math.max(0, Math.floor(diffMs / (1000 * 60 * 60 * 24)));

    const userHasEntered =
      forcedUserEntered !== undefined
        ? forcedUserEntered
        : this.parseUserHasEntered(r.userhasentered || r.hasentered);

    return {
      ref: slug,
      title: r.title && r.title.length > 0 ? r.title : slug,
      url: `https://www.kaggle.com/competitions/${slug}`,
      deadlineRaw: deadlineStr,
      category: r.category || "General",
      reward: r.reward || "Knowledge",
      teamCount: r.teamcount || r.teams || "0",
      userHasEntered,
      isExpired,
      daysLeft,
    };
  }

  /**
   * Retrieves ALL competitions entered by the user (regardless of creation date)
   * using `--group entered`, with active competitions ordered at the top.
   */
  public static async getJoinedActiveCompetitions(): Promise<
    CompetitionDetails[]
  > {
    let records: Record<string, string>[] = [];

    try {
      // Query specifically for competitions the user has entered
      const raw = await KaggleCliService.execute([
        "competitions",
        "list",
        "--group",
        "entered",
        "--page-size",
        "100",
        "--csv",
      ]);
      records = KaggleCliService.parseCsv(raw);
    } catch {
      // Fallback in case CLI version lacks --group support
      try {
        const raw = await KaggleCliService.execute([
          "competitions",
          "list",
          "--page-size",
          "100",
          "--csv",
        ]);
        records = KaggleCliService.parseCsv(raw).filter((r) =>
          this.parseUserHasEntered(r.userhasentered || r.hasentered),
        );
      } catch {
        records = [];
      }
    }

    const now = new Date();
    const joinedList: CompetitionDetails[] = [];

    for (const r of records) {
      const details = this.parseRecordToDetails(r, now, true);
      if (details) {
        joinedList.push(details);
      }
    }

    // Active competitions at the top (sorted by urgency), then closed ones
    return joinedList.sort(this.sortCompetitions);
  }

  /**
   * Fetches discovery competitions, strictly filtering out any competitions
   * the user has already entered, keeping active competitions at the top.
   */
  public static async getCompetitionsPage(
    page: number,
    pageSize: number = 20,
  ): Promise<CompetitionDetails[]> {
    const raw = await KaggleCliService.execute([
      "competitions",
      "list",
      "--sort-by",
      "recentlyCreated",
      "--page",
      page.toString(),
      "--page-size",
      pageSize.toString(),
      "--csv",
    ]);

    const records = KaggleCliService.parseCsv(raw);
    const now = new Date();
    const unenteredList: CompetitionDetails[] = [];

    for (const r of records) {
      const userEntered = this.parseUserHasEntered(
        r.userhasentered || r.hasentered,
      );

      // Enforce strict separation: do not duplicate entered competitions here
      if (userEntered) continue;

      const details = this.parseRecordToDetails(r, now, false);
      if (details) {
        unenteredList.push(details);
      }
    }

    // Active competitions at the top
    return unenteredList.sort(this.sortCompetitions);
  }

  public static async downloadCompetitionFiles(
    competitionSlug: string,
    destinationDir: string,
  ): Promise<string> {
    const cleanSlug = this.extractCleanSlug(competitionSlug);
    if (!fs.existsSync(destinationDir)) {
      fs.mkdirSync(destinationDir, { recursive: true });
    }
    return await KaggleCliService.downloadCompetitionFiles(
      cleanSlug,
      destinationDir,
    );
  }
}
