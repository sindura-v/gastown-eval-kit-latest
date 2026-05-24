# Enterprise Data Science Standards & Best Practices

This document defines enterprise-wide standards and best practices for delivering data science work that is reliable, secure, and production-ready. The intent is to enable consistent execution across teams—from problem framing through deployment and ongoing operations—while maintaining speed and accountability.

## Guiding Principles

- **Business outcome first:** Every data science effort ties to a business decision or operational action, with defined adoption, owners, and success criteria.

- **Reproducible in the cloud:** Work must run end-to-end in approved AWS environments (Databricks or JupyterHub), not dependent on someone’s laptop state.

- **Software engineering discipline:** Data science code meets the same baseline quality bars as application code (tests, reviews, CI, versioning).

- **AI-accelerated by default:** Teams leverage approved Gen AI tools to meet standards and accelerate development while remaining accountable for correctness, security, and compliance of all outputs.

- **Security ****&**** compliance design:** Access control, data classification, and auditability are built in from day one. Only sanctioned tools and platforms may be used with company data.

- **Model as a product:** If it ships, it’s owned, monitored, and supported—with a retirement plan.

## Table of Contents

	Enterprise Data Science Standards & Best Practices	1

	Guiding Principles	1

	Table of Contents	1

	1. Project & Product Lifecycle	2

	2. Coding Standards	4

	3. Documentation Standards	5

	4. Software Engineering & Version Control	6

	5. MLOps & Model Lifecycle	7

	6. Tools & Development Environments	8

	7. Computer Vision–Specific Standards	9

	8. Generative AI Usage Policy	10

	9. DS|ML Standards adoption mechanisms	10

	No-Regret Moves: Priority Actions to Improve Data Science Maturity	14

## 1. Project & Product Lifecycle

### 1.1 Project Initiation

- Every project **must begin with a clearly defined business problem** and a stakeholder-approved problem statement.

- A **project charter** (tracked in Jira) should document:

- The business question or opportunity

- Proposed analytical approach / hypothesis for how to solve it

- Required data sources and any data acquisition needs

- Success criteria and KPIs — how we objectively measure success

- Estimated timeline and resource requirements

- Risks, dependencies, and assumptions

- A **data feasibility assessment** must be completed before committing significant development effort.

### 1.2 Exploration & Development

- All exploratory work should be **time-boxed** and tracked as Jira tasks/stories.

- Experiments must be logged in an **experiment tracker** (MLflow on Databricks or standalone) with parameters, metrics, and artifact links. This applies to ML models, algorithms, heuristics, and simulations — any work involving **iterating on parameters and measuring outcomes** should be tracked.

- For non-ML work where MLflow feels heavyweight, structured logging to a **versioned config file + results table in S3/Delta Lake** is an acceptable alternative, provided it captures the same traceability (inputs, parameters, outputs, code version).

- A **go/no-go checkpoint** should occur after exploration before investing in productionization.

### 1.3 Productionization & Deployment

- Once a model, algorithm, or use case is validated, it transitions to a **productionization**** phase** in collaboration with the Application Development team.

- Follow standard **MLOps**** **(see Section 5) **and application development ****practices** for packaging, CI/CD, and deployment.

- Deployment must include:

- A **model card** documenting model purpose, performance, limitations, and ethical considerations

- Defined **SLAs** for latency, throughput, and availability

- A **rollback plan**

### 1.4 Production Support & Monitoring

- Once deployed, models are **handed off to the Support team** with:

- Runbooks and escalation procedures

- Monitoring dashboards (CloudWatch, Databricks dashboards, PowerBI, or Grafana)

- Defined thresholds for alerting on performance degradation, data drift, and system errors

- **Model retraining triggers** (scheduled or drift-based) must be defined at deployment time.

### 1.5 Experiment Design & Statistical Rigor

- All A/B tests must include a **power analysis and sample size calculation** (minimum 80% power at α = 0.05 unless otherwise justified) with primary/secondary metrics, guardrails, test duration, and randomization strategy defined upfront.

- Hypotheses and analysis plans must be **pre-registered** (in the repo, Jira, or Confluence) before data collection begins — no post-hoc hypothesis formulation presented as confirmatory analysis.

- Pre-registration should include: hypothesis, expected effect size, planned statistical test, and decision criteria.

- All experiment designs must undergo **peer review** by at least one other data scientist before execution.

- High-stakes experiments (revenue impact, customer-facing changes) require review by a senior/staff data scientist or statistician.

- Clearly distinguish between **correlational and causal claims** in all deliverables.

- Causal language (e.g., “X caused Y”) is only permitted when supported by a valid causal methodology (randomized experiment, diff-in-diff, regression discontinuity, instrumental variables, etc.).

- Observational analyses must explicitly state assumptions, limitations, and confounders.

- When a true experiment isn't feasible, document why and which quasi-experimental method was used.

### 1.6 Project Management & Tracking

- **Jira** is the single system of record for:

- Epics (projects), stories (features/tasks), bugs, and spikes (research)

- Sprint planning and backlog grooming

- Retrospectives and velocity tracking

- All production incidents related to data science products are tracked as Jira bugs with severity levels.

## 2. Coding Standards

### 2.1 Style & Formatting

- **Python** is the primary language for data science work. All Python code **must follow PEP 8** guidelines.

- When a project requires a **different language** (e.g., Go for real-time services, Scala for Spark, C++ for performance-critical components), the team must adopt and document the **accepted style guide for that language** (e.g., Effective Go, Google Java Style Guide) and enforce it with equivalent tooling.

- Use **automated formatters and linters** as part of the development workflow.  Teams should leverage internal AI agents or approved Gen AI tools to automatically apply formatting and linting standards.

- Maximum line length: **88 characters** (Black default) or 79 (strict PEP 8) — choose one and enforce consistently. Non-Python projects should follow their language's convention.

- **Type hints** (PEP 484) are strongly encouraged for all Python function signatures and required for production code. Statically typed languages should leverage their native type systems fully.

### 2.2 Generative AI–Assisted Coding

- Teams are **encouraged to leverage approved Gen AI tools** (currently GitHub Copilot) to accelerate development.

- **Only company-approved Gen AI tools** may be used — no unapproved third-party AI assistants or plugins.

- All AI-generated code is subject to the **same review, testing, and quality standards** as human-written code.

- Engineers are responsible for **understanding, validating, and owning** all AI-generated suggestions before merging.

- **Do not paste proprietary code, data, or business logic** into non-approved AI tools.

### 2.3 Python Project Structure

- All projects should follow a **standardized directory layout**:

| project-name/ |
| --- |
| ├── README.md |
| ├── setup.py / pyproject.toml |
| ├── src/ |
| │    └── project_name/ |
| │        ├── __init__.py |
| │        ├── data/ |
| │        ├── features/ |
| │        ├── models/ |
| │        └── utils/ |
| ├── tests/ |
| │    ├── unit/ |
| │    └── integration/ |
| ├── notebooks/ # exploratory only; not production code |
| ├── configs/ |
| ├── docs/ |
| └── requirements.txt / environment.yml |

- **Notebooks are for exploration only.** Any logic intended for production must be refactored into modular **.****py** files in **src****/**.

### 2.4 Python Naming Conventions

- **snake_case** for functions, variables, and modules.

- **CamelCase** for classes.

- **ALL_CAPS** for constants and environment variable references.

- Repository names: **lowercase-with-hyphens**.

## 3. Documentation Standards

### 3.1 Code Documentation

- All public functions, classes, and modules **must have docstrings** (NumPy or Google style — pick one for each language and enforce it).

- Complex algorithms or non-obvious logic must include **inline comments** explaining *why*, not just *what*.

- Every repository must have a **comprehensive README.md** including:

- Purpose, setup instructions, usage examples, architecture overview, and points of contact.

### 3.2 White Papers & Technical Write-ups

- Models or algorithms with significant mathematical, statistical, or novel methodological content **must be documented in a formal white paper** (LaTeX, Markdown-rendered PDF, or Word Doc).

- White papers should include:

- Problem formulation and mathematical notation

- Methodology, derivations, and algorithmic details

- Experimental design, results, and statistical analysis

- Limitations, assumptions, and future work

- White papers are **preferred over slide decks** for communicating technical results internally and externally.

- Teams should seek opportunities to **present work**** internally, throughout Brambles** to inform the company of the important work being done

- Teams should actively seek opportunities to **present work at external conferences** (peer-reviewed venues, industry summits, meetups) to build the organization's brand and attract talent.

### 3.3 Model Documentation

- Every production model must have a **model card** documenting:

- Training data, features, hyperparameters, performance benchmarks

- Fairness, bias, and ethical considerations

- Intended use, known limitations, and out-of-scope usage

## 4. Software Engineering & Version Control

### 4.1 Version Control

- **All code, configuration, and infrastructure-as-code must live in GitHub or Bitbucket** — nothing runs from local machines or ad-hoc scripts.

- Follow a **branching strategy** (Git Flow or trunk-based development):

- **main** / **master** — always deployable

- **develop** — integration branch

- Feature branches: **feature/JIRA-123-description**

- Hotfix branches: **hotfix/JIRA-456-description**

- **Commit**** messages** should follow a consistent convention (e.g., Conventional Commits) and reference Jira ticket IDs.

### 4.2 Code Reviews & Pull Requests

- **All changes** to **main** or **develop** require a pull request with at least one peer review.

- PR descriptions should include: what changed, why, how to test, and any relevant Jira links.

- Automated checks (linting, tests, security scans) must **pass**** before merge**.

### 4.3 Testing

- **Unit tests** are required for all production code (target ≥ 80% coverage).

- **Integration tests** for data pipelines and model-serving endpoints.

- **Data validation tests** (e.g., Great Expectations, Deequ) for input data quality.

- Use **pytest** as the standard testing framework.

### 4.4 CI/CD

- All repositories must have **CI/CD pipelines** (Bitbucket Pipelines) that:

- Run linting and formatting checks

- Execute unit and integration tests

- Build and publish artifacts (Docker images, Python packages)

- Deploy to staging/production environments with approval gates

### 4.5 Secrets & Configuration Management

- **Never hardcode credentials, API keys, or sensitive data** in code or config files.

- Use **AWS Secrets Manager**, **SSM Parameter Store**, **Bitbucket**** Repository ****Variables**, or **Databricks Secrets** for all sensitive values.

- Environment-specific config via environment variables or config files excluded from version control (**.****gitignore**).

## 5. MLOps & Model Lifecycle

### 5.1 Experiment Tracking

- All experiments must be logged to **MLflow** (integrated with Databricks) with:

- Parameters, metrics, artifacts, and source code version (Git SHA)

- Dataset version or reference

### 5.2 Model Registry

- Use the **Databricks/****MLflow**** Model Registry** to manage model versions, stage transitions (Staging → Production → Archived), and approval workflows.

### 5.3 Model Deployment

- Models are deployed via:

- **Databricks Model Serving**, **Kubeflow**, or **containerized services (ECS/EKS)** depending on the use case.

- Batch inference via **Databricks Jobs** or **AWS Step Functions / Glue**.

- Use **canary or shadow deployments** for high-risk model releases.

### 5.4 Monitoring & Observability

- Monitor in production:

- **Data drift** (feature distribution changes)

- **Model performance drift** (prediction quality vs. ground truth)

- **System health** (latency, error rates, resource utilization)

- Tools: **Evidently AI**, **AWS CloudWatch**, **Databricks Lakehouse Monitoring**, or custom dashboards.

### 5.5 Retraining & Feedback Loops

- Define retraining cadence (scheduled or triggered by drift alerts).

- Automate retraining pipelines with human-in-the-loop approval before production promotion.

- Capture production predictions and outcomes to build **feedback loops** for continuous improvement.

## 6. Tools & Development Environments

### 6.1 Standardized Platforms

- **Primary development environment: Databricks** (on AWS) for most ML, analytics, and data engineering workloads.

- **JupyterHub**** (Kubeflow)** remains the environment for workloads requiring additional flexibility (e.g., computer vision, custom GPU environments, specialized libraries).

- Teams should **not introduce new tools, platforms, or cloud services** without review and approval from the architecture / data science leadership team.

### 6.2 Cloud Standards

- **All compute, storage, and infrastructure must be in AWS** — no on-premises or local-machine processing of company data. External services can be used with approval and procurement in the loop.

- Data storage: **S3** (with versioning enabled for critical datasets), **Delta Lake** on Databricks, and **TimescaleDB** for time-series or other applicable data.

- Compute: **Databricks clusters**, **Kubeflow**, **EC2/ECS/EKS** as appropriate. The **Cloud Engineering team** will provide guidance and recommendations on compute resource selection, sizing, and architecture patterns — data science teams should engage them early when planning new workloads or scaling existing ones.

- Infrastructure-as-code: **Terraform** or **AWS CloudFormation** for all provisioned resources.

### 6.3 Breaking Down Silos

- Establish **shared libraries and internal Python packages** for common utilities (data connectors, feature engineering helpers, evaluation metrics) to reduce duplication across teams.

- Maintain a **central model and feature catalog** so teams can discover and reuse each other's work.

- Hold **regular cross-team tech talks, code reviews, and architecture reviews** to share knowledge.

- Agree on a **common tech stack** (Python version, key library versions, Spark version) and publish a supported-libraries list quarterly.

### 6.4 Environment Reproducibility

- Use **Conda environments** (environment.yml) or **Docker containers** to ensure reproducibility.

- Pin all dependency versions in requirements.txt or pyproject.toml.

- Databricks clusters should use **cluster policies** to enforce consistent runtime versions.

## 7. Computer Vision–Specific Standards

These supplement the general standards above and apply to all computer vision projects (typically developed in JupyterHub with GPU instances).

### 7.1 Data & Annotation Management

- Use a dedicated **annotation platform** (e.g., Label Studio, CVAT, Labelbox, or Amazon SageMaker Ground Truth) with versioned annotation schemas.

- **Version all image/video datasets** using DVC or S3 versioning — raw images, augmented sets, and annotation files must all be versioned together.

- Maintain a **labeling guideline document** for each project; version it alongside the annotation schema.

- Implement **annotation quality checks**: inter-annotator agreement scores, automated consistency validation scripts, and multi-pass review workflows.

### 7.2 Training & Experimentation

- Log not just metrics and parameters but also **sample predictions** (with bounding boxes, segmentation masks, etc.) as MLflow artifacts for visual inspection.

- Track **data augmentation pipelines** as code (e.g., Albumentations configs) and version them.

- For transfer learning, document the **pretrained model source, version, and license**.

### 7.3 GPU & Compute Management

- Use **AWS EC2 GPU instances** (P4, P5, G5, etc.) or **SageMaker Training Jobs** with spot instances for cost efficiency.

- All GPU environments should use **Docker images** with pinned CUDA, cuDNN, and framework (PyTorch/TensorFlow) versions.

- Implement **experiment queuing** to maximize GPU utilization across the team.

### 7.4 Model Optimization & Deployment

- Evaluate **model optimization techniques** before deployment: quantization, pruning, ONNX conversion, TensorRT.

- CV inference endpoints should have **latency and throughput benchmarks** documented and tested.

- For edge deployment scenarios, maintain separate **edge-optimized model artifacts** alongside full-precision versions.

### 7.5 Ethical & Privacy Considerations

- All CV projects handling images of people must have a **privacy impact assessment**.

- Implement **PII detection and redaction** (face blurring, license plate obfuscation) in data pipelines where required.

- Document potential biases in training data (demographic representation, geographic coverage).

## 8. Generative AI Usage Policy

- **Actively leverage approved Gen AI tools** to accelerate coding, documentation drafting, data exploration, and ideation.

- **Approved tools only** — maintain a published list of sanctioned tools and update it regularly. Unapproved tools (public ChatGPT, etc.) must not be used with company data or code.

- **Data protection**: Never input proprietary data, PII, customer data, or trade secrets into any unapproved Gen AI tool.

- **Attribution ****&**** ownership**: Understand the IP and licensing implications of AI-generated content.

## 9. DS|ML Standards adoption mechanisms

Standards deliver value only when actively understood, consistently applied, and continuously improved. The following mechanisms work together to make applying the standards the path of least resistance.

### 9.1 Compliance Audits

- **Automated audits** will scan all data science and ML repositories on a regular cadence for mandatory and recommended assets (README files, model cards, test suites, CI/CD configs, experiment tracking, project charters, white papers).

- Results will be aggregated into a **compliance dashboard** visible to team leads and leadership.

- Teams receive automated notifications when projects fall below mandatory compliance thresholds.

- Compliance trends inform resource allocation and identify teams needing additional support.

- **Intent**: Provide objective visibility to enable targeted coaching, not to punish.

### 9.2 Personal Objectives

- Standards adherence is an **implicit part of project success**, not a separate objective. 

- Committing to deliver a project means committing to deliver it according to these standards: proper documentation, testing, version control, experiment tracking, and all practices defined here. 

- **Project success includes** technical correctness, business impact, and standards adherence. 

- Managers assess project quality using compliance audit results and peer review feedback alongside business outcomes. 

- **Philosophy**: Meeting these standards is not extra work; it *is* doing the project correctly. 

### 9.3 Governance Rituals

- Standards are a **living ****document**, updated as needed when tooling, practices, and organizational needs to evolve.

- Each release includes release notes (changes, additions, deprecations) and semantic versioning (major.minor.patch).

- **Change request process**: Any team member can propose changes via a designated channel (Jira or form); the standards working group reviews and provides rationale.

- A **named standards owner** is accountable for releases, communications, and backlog management.

- Leadership actively solicits feedback.

### 9.4 Role Modelling

- Teams and individuals demonstrating strong standards application will be **publicly acknowledged** through shout-outs, spotlights, cross-team presentations, and awards.

- Their projects will serve as **case studies** and be compiled into a **library of exemplar projects** as a practical companion to this document.

- Recognition applies equally to junior and senior staff.

- **Goal**: Make standards excellence visible and aspirational.

### 9.5 Training and Attendance

- **Training is available ****on-demand** for specific standards topics (MLflow tracking, model cards, CI/CD pipelines, project charters) when team members need it.

- Sessions are practical, hands-on, and use real organizational examples.

- **Primary learning method**: Learn from peers through code reviews, the exemplar project library (Section 9.3), and your colleagues.

- Subject matter experts from the team may deliver targeted sessions when new tools or practices are introduced.

- The expectation is to learn by doing, with training available as a resource rather than a requirement.

### 9.6 Onboarding Integration

- New joiners receive an introduction to the standards document as part of onboarding, covering its purpose, structure, and how to navigate it.

- **Managers and colleagues** are responsible for ensuring new team members understand and apply the standards as the team's ways of working.

- Learning happens through normal project work, code reviews, and observing the exemplar project library.

- **Goal**: New team members understand that these standards define how work gets done, not optional guidelines.

### 9.7 Peer Review as an Adoption Lever

- **AI agents automatically scan pull requests** and flag standards violations (docstrings, project structure, experiment logging) before human review.

- Automated checks are embedded into existing workflows (pre-commit hooks, CI/CD pipelines) for consistent enforcement.

- Human reviewers focus on design decisions and business logic while agents handle routine standards verification.

- Reviewers providing high-quality standards feedback are recognized through the role modelling programme (Section 9.4).

# No-Regret Moves: Priority Actions to Improve Data Science Maturity

These are high-impact, low-risk improvements to tackle first — foundational steps that pay dividends regardless of future strategic decisions.

### Tier 1 — Do Immediately (Weeks 1–4)

- **Enforce version control for everything** — Mandate that all code, notebooks, and configs are committed to Bitbucket. No exceptions. No "running from my laptop."

- **Require pull requests and code reviews** — Turn on branch protection on **main** for all repos. Every merge requires at least one review.

- **Adopt a code formatter and linter org-wide** — This can be something like pylint or a designed agent. Add pre-commit hooks so formatting is automatic, not a debate.

- **Publish the approved Gen AI tools list** — Currently only GitHub Copilot is sanctioned.  We will investigate a playground to test other tools.

- **Standardize Jira usage** — Define a consistent workflow (Epic → Story → Task/Bug) and require all data science work to be tracked. Link commits and PRs to Jira tickets.

- **Build internal AI agents for common development tasks** — Develop and maintain one or more agents that assist with code formatting, unit test generation, documentation drafting, and project charter creation. Make these available to all data scientists with training on how to use them effectively. These agents accelerate adoption of the standards in this document and reduce the friction of doing things the right way.

### Tier 2 — Establish Foundations (Months 1–3)

- **Stand up ****MLflow**** experiment tracking** — If not already active in Databricks, enable it and mandate its use. This is the single biggest unlock for reproducibility.

- **Create a standard project template repository** — A Bitbucket template repo with the approved directory structure, CI/CD config, pre-commit hooks, and README template. Every new project starts from this template.

- **Implement CI/CD pipelines for data science repos** — Even basic pipelines (lint → test → build) for every repo. Start simple, iterate.

- **Build a shared internal Python package** — Identify the top 5–10 utilities duplicated across teams and consolidate them into an installable internal package.

### Tier 3 — Accelerate & Scale (Months 3–6)

- **Formalize the Databricks migration plan** — Identify which JupyterHub (or Kubeflow) workloads move to Databricks and which stay and vice versa. Document the criteria and timeline.

- **Establish a model registry and promotion workflow** — Use MLflow/Databricks Model Registry with defined stage gates (Dev → Staging → Production).

- **Launch cross-team tech talks and architecture reviews** — Monthly cadence. Rotate presenters. This is the fastest way to break silos.

- **Begin white paper practice** — Pick 2–3 mature projects and write up results as white papers. Target one external conference submission within 6 months.

- **Implement data drift monitoring on existing production models** — Even a lightweight dashboard beats having no visibility.

### Tier 4 — Mature & Differentiate (Months 6–12)

- **Deploy a feature store** — Reduce duplicated feature engineering and create a single source of truth for training and serving features.

- **Adopt automated retraining pipelines** — For high-value models, automate retraining with human-in-the-loop approval.

- **Build a model ****&**** dataset catalog** — A searchable internal catalog so teams can discover and reuse existing models, features, and datasets.

- **Establish a formal model ****peer review ****board** — Review production model deployments, retirements, and risk assessments on a regular cadence.

- **Publish external conference papers and blog posts** — Build the company's reputation as a data science leader and use this as a talent acquisition tool.

This document is designed to be a **living standard** — revisited quarterly, updated as tooling and practices evolve, and enforced through a combination of automation (pre-commit hooks, CI/CD gates) and culture (code reviews, architecture reviews, retrospectives). The goal is not bureaucracy but **consistency, quality, and velocity**.

Classification: General

Classification: General

Classification: General