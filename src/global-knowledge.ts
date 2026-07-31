import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { randomUUID } from "node:crypto";

export interface GlobalKnowledgeEntry {
  id: string;
  category: string;
  title: string;
  principle: string;
  rationale: string;
  appliesTo: string[];
  evidence: string[];
  publishedAt: number;
  publishedBy: string;
}

export interface GlobalKnowledgeProposal {
  id: string;
  category: string;
  title: string;
  principle: string;
  rationale: string;
  appliesTo: string[];
  evidence: string[];
  proposedAt: number;
  proposedBy: string;
  status: "pending" | "committed" | "rejected";
  resolvedAt?: number;
  resolvedBy?: string;
}

export interface GlobalKnowledgeSnapshot {
  schemaVersion: 1;
  version: number;
  updatedAt: number;
  entries: GlobalKnowledgeEntry[];
}

interface GlobalKnowledgeState {
  snapshot: GlobalKnowledgeSnapshot;
  proposals: GlobalKnowledgeProposal[];
}

export interface KnowledgeProposalInput {
  category: string;
  title: string;
  principle: string;
  rationale: string;
  appliesTo: string[];
  evidence: string[];
}

interface KnowledgePersistence {
  load(): Promise<GlobalKnowledgeState | undefined>;
  save(state: GlobalKnowledgeState): Promise<void>;
}

const initialState = (): GlobalKnowledgeState => ({
  snapshot: {
    schemaVersion: 1,
    version: 0,
    updatedAt: 0,
    entries: [],
  },
  proposals: [],
});

function cloneState(state: GlobalKnowledgeState): GlobalKnowledgeState {
  return structuredClone(state);
}

function validateState(value: unknown): GlobalKnowledgeState | undefined {
  if (!value || typeof value !== "object") return undefined;
  const state = value as Partial<GlobalKnowledgeState>;
  if (!state.snapshot || !Array.isArray(state.proposals)) return undefined;
  if (
    state.snapshot.schemaVersion !== 1
    || typeof state.snapshot.version !== "number"
    || typeof state.snapshot.updatedAt !== "number"
    || !Array.isArray(state.snapshot.entries)
  ) return undefined;
  return state as GlobalKnowledgeState;
}

class FileKnowledgePersistence implements KnowledgePersistence {
  constructor(private readonly path: string) {}

  async load(): Promise<GlobalKnowledgeState | undefined> {
    try {
      const parsed = JSON.parse(await readFile(this.path, "utf8")) as unknown;
      return validateState(parsed);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
      throw error;
    }
  }

  async save(state: GlobalKnowledgeState): Promise<void> {
    await mkdir(dirname(this.path), { recursive: true });
    const temporary = `${this.path}.${process.pid}.${randomUUID()}.tmp`;
    await writeFile(temporary, `${JSON.stringify(state, null, 2)}\n`, "utf8");
    await rename(temporary, this.path);
  }
}

class RedisRestKnowledgePersistence implements KnowledgePersistence {
  constructor(
    private readonly url: string,
    private readonly token: string,
    private readonly key: string,
  ) {}

  private async command(command: unknown[]): Promise<unknown> {
    const response = await fetch(`${this.url.replace(/\/+$/, "")}/pipeline`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${this.token}`,
        "content-type": "application/json",
      },
      body: JSON.stringify([command]),
    });
    if (!response.ok) {
      throw new Error(`Knowledge Redis request failed with HTTP ${response.status}.`);
    }
    const payload = await response.json() as Array<{ result?: unknown; error?: string }>;
    const first = payload[0];
    if (!first || first.error) throw new Error(first?.error ?? "Knowledge Redis returned no result.");
    return first.result;
  }

  async load(): Promise<GlobalKnowledgeState | undefined> {
    const result = await this.command(["GET", this.key]);
    if (typeof result !== "string" || result === "") return undefined;
    return validateState(JSON.parse(result) as unknown);
  }

  async save(state: GlobalKnowledgeState): Promise<void> {
    await this.command(["SET", this.key, JSON.stringify(state)]);
  }
}

export interface GlobalKnowledgeStoreOptions {
  filePath?: string;
  redisUrl?: string;
  redisToken?: string;
  redisKey?: string;
}

export class GlobalKnowledgeStore {
  private state: GlobalKnowledgeState | undefined;
  private operation = Promise.resolve();

  constructor(private readonly persistence: KnowledgePersistence) {}

  private async loaded(): Promise<GlobalKnowledgeState> {
    if (!this.state) this.state = (await this.persistence.load()) ?? initialState();
    return this.state;
  }

  private serialize<T>(work: () => Promise<T>): Promise<T> {
    const result = this.operation.then(work, work);
    this.operation = result.then(() => undefined, () => undefined);
    return result;
  }

  async snapshot(): Promise<GlobalKnowledgeSnapshot> {
    return cloneState(await this.loaded()).snapshot;
  }

  async propose(input: KnowledgeProposalInput, proposedBy: string): Promise<GlobalKnowledgeProposal> {
    return this.serialize(async () => {
      const state = await this.loaded();
      const duplicate = state.proposals.find(
        (proposal) =>
          proposal.status === "pending"
          && proposal.title.toLocaleLowerCase() === input.title.toLocaleLowerCase()
          && proposal.principle === input.principle,
      );
      if (duplicate) return structuredClone(duplicate);
      const pendingByProposer = state.proposals.filter(
        (proposal) => proposal.status === "pending" && proposal.proposedBy === proposedBy,
      ).length;
      if (pendingByProposer >= 20) {
        throw new Error("This Studio session already has 20 pending knowledge proposals.");
      }
      const proposal: GlobalKnowledgeProposal = {
        id: randomUUID(),
        ...structuredClone(input),
        proposedAt: Date.now(),
        proposedBy,
        status: "pending",
      };
      state.proposals.push(proposal);
      state.proposals = state.proposals.slice(-500);
      await this.persistence.save(state);
      return structuredClone(proposal);
    });
  }

  async pending(): Promise<GlobalKnowledgeProposal[]> {
    const state = await this.loaded();
    return state.proposals
      .filter((proposal) => proposal.status === "pending")
      .sort((left, right) => left.proposedAt - right.proposedAt)
      .map((proposal) => structuredClone(proposal));
  }

  async resolve(
    proposalId: string,
    decision: "commit" | "reject",
    resolvedBy: string,
  ): Promise<{ proposal: GlobalKnowledgeProposal; snapshot: GlobalKnowledgeSnapshot }> {
    return this.serialize(async () => {
      const state = await this.loaded();
      const proposal = state.proposals.find((candidate) => candidate.id === proposalId);
      if (!proposal) throw new Error("Global knowledge proposal not found.");
      if (proposal.status !== "pending") throw new Error(`Proposal is already ${proposal.status}.`);
      proposal.status = decision === "commit" ? "committed" : "rejected";
      proposal.resolvedAt = Date.now();
      proposal.resolvedBy = resolvedBy;
      if (decision === "commit") {
        state.snapshot.version += 1;
        state.snapshot.updatedAt = proposal.resolvedAt;
        state.snapshot.entries.push({
          id: proposal.id,
          category: proposal.category,
          title: proposal.title,
          principle: proposal.principle,
          rationale: proposal.rationale,
          appliesTo: [...proposal.appliesTo],
          evidence: [...proposal.evidence],
          publishedAt: proposal.resolvedAt,
          publishedBy: resolvedBy,
        });
        state.snapshot.entries = state.snapshot.entries.slice(-500);
      }
      await this.persistence.save(state);
      return {
        proposal: structuredClone(proposal),
        snapshot: structuredClone(state.snapshot),
      };
    });
  }
}

export function createGlobalKnowledgeStore(
  options: GlobalKnowledgeStoreOptions = {},
): GlobalKnowledgeStore {
  if (options.redisUrl && options.redisToken) {
    return new GlobalKnowledgeStore(new RedisRestKnowledgePersistence(
      options.redisUrl,
      options.redisToken,
      options.redisKey ?? "motion-director:global-knowledge:v1",
    ));
  }
  return new GlobalKnowledgeStore(
    new FileKnowledgePersistence(options.filePath ?? "data/global-knowledge.json"),
  );
}
