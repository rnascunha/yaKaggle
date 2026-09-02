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
    if (clean.includes("kaggle.com/competitions/")) {
      const parts = clean.split("kaggle.com/competitions/");
      clean = parts[1].replace(/\/.*$/, "");
    } else if (clean.includes("/")) {
      const parts = clean.split("/");
      clean = parts[parts.length - 1];
    }
    return clean.replace(/\/$/, "").trim();
  }

  private static parseUserHasEntered(val?: string): boolean {
    if (!val) return false;
    const clean = val.trim().toLowerCase();
    return clean === "true" || clean === "1" || clean === "yes";
  }

  /**
   * Retrieves all competitions and extracts ONLY those the user entered that are not finished yet.
   */
  public static async getJoinedActiveCompetitions(): Promise<
    CompetitionDetails[]
  > {
    let records: Record<string, string>[] = [];

    // Query active competitions
    try {
      const raw = await KaggleCliService.execute([
        "competitions",
        "list",
        "--page-size",
        "100",
        "--csv",
        "--sort-by",
        "recentlyCreated",
      ]);
      records = KaggleCliService.parseCsv(raw);
    } catch {
      records = [];
    }

    const now = new Date();
    const joinedActive: CompetitionDetails[] = [];

    for (const r of records) {
      // STRICT check: ONLY respect the userhasentered column
      const userEntered = this.parseUserHasEntered(
        r.userhasentered || r.hasentered,
      );
      if (!userEntered) continue;

      const slug = this.extractCleanSlug(r.ref || r.url || r.title);
      if (!slug) continue;

      const deadlineStr = r.deadline || r.deadlinedate || "";
      const deadlineDate = new Date(deadlineStr);
      const isExpired =
        !isNaN(deadlineDate.getTime()) &&
        deadlineDate.getTime() < now.getTime();

      // Only ongoing/active competitions
      if (!isExpired) {
        const diffMs = !isNaN(deadlineDate.getTime())
          ? deadlineDate.getTime() - now.getTime()
          : 0;
        const daysLeft = Math.max(
          0,
          Math.floor(diffMs / (1000 * 60 * 60 * 24)),
        );

        joinedActive.push({
          ref: slug,
          title: r.title && r.title.length > 0 ? r.title : slug,
          url: `https://www.kaggle.com/competitions/${slug}`,
          deadlineRaw: deadlineStr,
          category: r.category || "General",
          reward: r.reward || "Knowledge",
          teamCount: r.teamcount || r.teams || "0",
          userHasEntered: true,
          isExpired: false,
          daysLeft,
        });
      }
    }

    return joinedActive;
  }

  /**
   * Fetches recent competitions ordered by creation date.
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

    return records.map((r) => {
      const slug = this.extractCleanSlug(r.ref || r.url || r.title);
      const deadlineStr = r.deadline || r.deadlinedate || "";
      const deadlineDate = new Date(deadlineStr);
      const isExpired =
        !isNaN(deadlineDate.getTime()) &&
        deadlineDate.getTime() < now.getTime();
      const diffMs = !isNaN(deadlineDate.getTime())
        ? deadlineDate.getTime() - now.getTime()
        : 0;
      const daysLeft = Math.max(0, Math.floor(diffMs / (1000 * 60 * 60 * 24)));

      const userHasEntered = this.parseUserHasEntered(
        r.userhasentered || r.hasentered,
      );

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
    });
  }

  /**
   * Parses the CSV from `kaggle competitions leaderboard <slug> -s --csv`.
   * Standard columns: teamId, teamName, submissionDate, score
   */
  public static async getLeaderboard(
    competitionSlug: string,
  ): Promise<{ topEntries: LeaderboardEntry[]; userEntry?: LeaderboardEntry }> {
    const cleanSlug = this.extractCleanSlug(competitionSlug);
    const raw = await KaggleCliService.execute([
      "competitions",
      "leaderboard",
      cleanSlug,
      "-s",
      "--csv",
    ]);

    const records = KaggleCliService.parseCsv(raw);
    const creds = CredentialsManager.inspectCredentials();
    const myUsername = (creds.username || "").trim().toLowerCase();

    const topEntries: LeaderboardEntry[] = [];
    let userEntry: LeaderboardEntry | undefined;

    records.forEach((r, idx) => {
      const values = Object.values(r);

      // Standard columns: teamId, teamName, submissionDate, score
      const teamName =
        r.teamname || r.team || (values.length > 1 ? values[1] : "Team");
      const score = r.score || (values.length > 3 ? values[3] : "");
      const submissionDate =
        r.submissiondate ||
        r.lastsubmission ||
        (values.length > 2 ? values[2] : "");
      const entries = r.entries || r.submissioncount || "1";
      const rank = (idx + 1).toString();

      // Check if teamName contains Kaggle username or display handle
      const isCurrentUser =
        myUsername.length > 0 && teamName.toLowerCase().includes(myUsername);

      const entry: LeaderboardEntry = {
        rank,
        teamName,
        score,
        entries,
        lastSubmission: submissionDate,
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

  public static async downloadCompetitionFiles(
    competitionSlug: string,
    destinationDir: string,
  ): Promise<string> {
    const cleanSlug = this.extractCleanSlug(competitionSlug);
    if (!fs.existsSync(destinationDir)) {
      fs.mkdirSync(destinationDir, { recursive: true });
    }
    return await KaggleCliService.execute([
      "competitions",
      "download",
      cleanSlug,
      "-p",
      `"${destinationDir}"`,
    ]);
  }
}
