import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const moduleRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const read = (path: string) => readFileSync(resolve(moduleRoot, path), "utf8");
const kernel = read("resources/kernel.md");
const readme = read("README.md");
const investigation = read("resources/references/playbooks/investigate-and-decide.md");
const review = read("resources/references/playbooks/review.md");
const readiness = read("resources/references/readiness-review.md");
const correctness = read("resources/references/correctness-review.md");
const spine = read("resources/references/playbooks/build-and-change.md");
const roles = read("resources/references/model-roles.md");

describe("CX routing policy", () => {
	test("makes direct work the default and routes only concrete consequences", () => {
		expect(kernel).toContain("Direct is the default");
		expect(kernel).toContain("ordinary questions, recommendations, reversible local work, and small fixes");
		expect(kernel).toContain("Route only for:");
		expect(kernel).toContain("Costly, hidden, or hard-to-undo failure");
		expect(kernel).toContain("Material production, data, security, money, deployment, shared-interface, or architecture impact");
		expect(kernel).toContain("Explicit review or delivery");
	});

	test("does not classify routes from user wording or task shape", () => {
		expect(kernel).toContain("Wording, task category, tickets, pull requests, step count, and file count never earn a route");
		expect(kernel).not.toContain("Read, explain, investigate, compare, recommend, or answer");
		expect(investigation).toContain("Ordinary explanations, recommendations, and confidence questions stay direct");
	});

	test("keeps routes proportional and transitions symmetric", () => {
		expect(kernel).toContain("A route names authority, not ceremony");
		expect(kernel).toContain("Transitions are symmetric");
		expect(kernel).toContain("Routed work downgrades when first inspection finds no trigger");
	});

	test("earns maintainability and correctness review from risk", () => {
		expect(review).toContain("Run Maintainability Review when earned");
		expect(review).toContain("Run one Correctness Review when earned");
		expect(review).toContain("only when a wrong result is costly, hidden, hard to undo");
	});

	test("earns readiness from unresolved material assumptions, not structure alone", () => {
		expect(kernel).toContain("for unresolved material design or safety assumptions");
		expect(kernel).not.toContain("before consequential implementation approval or structural changes");
		expect(readiness).toContain("material design direction or load-bearing safety assumption remains unresolved");
		expect(readiness).toContain("They do not automatically require a child");
		expect(readiness).toContain("current source, authority, ownership, and callers settle the material direction");
		expect(readiness).toContain("before consequential action or use");
		expect(readiness).toContain("An unresolved material assumption still requires review");
		expect(readiness).toContain("User-owned choices still require escalation");
		expect(readiness).toContain("A failed child leaves readiness blocked");
		for (const route of ["feature", "refactor"]) {
			const body = read(`resources/references/playbooks/${route}.md`);
			expect(body).toContain("review condition and inspection guidance in Readiness Review");
			expect(body).not.toContain("Apply the structural triggers");
		}
	});

	test("keeps maintainability owned without stacking skills from task size", () => {
		expect(review).toContain("The parent checks maintainability");
		expect(review).toContain("observed avoidable complexity or duplication");
		expect(review).toContain("named maintainability risk");
		expect(review).toContain("Choose depth within Maintainability Review");
		expect(review).toContain("one adaptive maintainability owner");
		expect(review).not.toContain("thermo-nuclear-code-quality-review");
		expect(review).not.toContain("PR-sized");
		expect(review).not.toContain("A skip stays visible");
	});

	test("permits evidenced routine completion while preserving required independent review", () => {
		expect(spine).toContain("may complete routine work with adequate evidence");
		expect(spine).toContain("its correctness consequence gate is met");
		expect(spine).not.toContain("Do not approve your own implementation");
		expect(correctness).toContain("Launch one fresh background child");
		expect(correctness).toContain("blocks mutation, Delivery, and completion");
		expect(correctness).toContain("A failed child leaves correctness review unresolved");
		expect(review).toContain("Another full independent review requires a named material risk");
	});

	test("uses short source-based briefs without dropping unavailable context", () => {
		expect(roles).toContain("concise source-based");
		expect(roles).toContain("including untracked additions, rather than copying them");
		expect(roles).toContain("child must read the relevant primary sources");
		expect(roles).toContain("observed proof, failures, and critical context unavailable");
		expect(roles).toContain("include applicable rules or explicit instructions to read their owning files");
		expect(readiness).toContain("brief guidance from Model roles");
		expect(correctness).toContain("brief guidance from Model roles");
		expect(correctness).toContain("Where to inspect the complete current diff");
	});

	test("describes the same consumer experience in the README", () => {
		expect(readme).toContain("Direct is the default for ordinary questions, recommendations, reversible local work, and small fixes");
		expect(readme).toContain("A route names the authority boundary, not the amount of ceremony");
		expect(readme).toContain("Todo records actual independent work");
	});
});
