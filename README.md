# harpguru-cloud

The AWS half of the Harp Guru project: CDK, the API, the publication pipeline and the
analytics. It holds no harmonica domain code — see the orientation file for why that line
matters and where it is drawn.

**Start with [docs/orientation.md](docs/orientation.md).** It points at the roadmap and the
findings document, which live in
[js-jslog/harpguru](https://github.com/js-jslog/harpguru) and are the plan this repo works
to. Read them before planning anything here.

Built from [devcontainer-aws-base](https://github.com/js-jslog/devcontainer-aws-base), so
the container conventions, scripts and toolchain below are inherited from it. See
[docs/aws-conventions.md](docs/aws-conventions.md) for credentials, cost control, the
CDK-versus-Terraform decision, Python packaging and the neovim roadmap.

## Toolchain

Everything is pinned and baked at image-build time. The only devcontainer *feature* is
docker-in-docker.

| Tool | Version |
|---|---|
| JDK (Temurin) | 21 |
| Node | 24.20.0 |
| pnpm | 10.21.0 |
| Python | 3.12 + `venv`, `pipx`, `boto3` |
| AWS CLI | v2 2.36.32 |
| Session Manager plugin | latest (no pinnable artifact is published) |
| AWS SAM CLI | 1.165.0 |
| AWS CDK | 2.1139.0 |
| Terraform | 1.15.9 |
| kubectl / helm / eksctl | 1.37.0 / 4.2.4 / 0.230.0 |
| neovim | 0.11.2 + [neovim-config](https://github.com/js-jslog/neovim-config) |
| lazygit / GCM / Claude Code | 0.63.1 / 2.4.1 / latest |
| jq, less, tcc + libc6-dev, ripgrep, tmux | apt |

## Upstream

This repository was created by cloning `devcontainer-aws-base` and re-pointing `origin`,
rather than by forking it on GitHub — a GitHub fork would default every pull request here
to the base repository. The base is kept as a second remote, so improvements to it can be
pulled in:

```
git remote add upstream https://github.com/js-jslog/devcontainer-aws-base.git
git fetch upstream && git merge upstream/main
```

Note that the base is on `main` while this repository is on `master`, to match `harpguru`,
which it is worked on alongside.

Everything else is inherited and should be left to track upstream. What is local to this
project is its image and volume names, which live in three files — review these after any
merge from upstream:

| File | Carries |
|---|---|
| `.devcontainer/devcontainer.json` | `image`, the `workspaceMount` source, the four `mounts` volumes |
| `runcontainer.ps1` | the `docker pull`, `$workspaceVolume`, `$homeVolumes` |
| `buildimage.sh` | the `image` var |

The names themselves:

- Image `jslog/devcontainer-harpguru-cloud`
- Workspace volume `devcontainer-harpguru-cloud-volume`
- Under `/home/dev`: `harpguru-cloud-aws`, `harpguru-cloud-kube`, `harpguru-cloud-gradle`,
  `harpguru-cloud-tf-cache`

Those four are **separate from the base's, not shared**, so the `~/.aws` credentials here
belong to this project alone. They have to appear in `$homeVolumes` as well as in `mounts`,
or `purge` silently stops finding them and leaves them behind.

The docker-in-docker volume needs no attention: the feature names it after the devcontainer
id, so this project gets its own automatically.

**The build context must be a git checkout.** The Dockerfile runs `git reset --hard` to
restore symlinks after the Windows prep change, so `docker build` fails in a directory with
no `.git`. This is inherited from node-base.

## Usage

### Launch from Windows

The project is intended for initiation on a Windows machine with Docker Desktop installed.
Windows is intended to only be used as a launchpad, and no changes to the project contents
are expected.

There is a prerequisite to have installed the devcontainer CLI.

```
git clone https://github.com/js-jslog/harpguru-cloud.git
./runcontainer.ps1 start
```

This project's image has to exist on Docker Hub before that pull can succeed — see
[Publish a new image](#publish-a-new-image) for the first build.

Three modes, in ascending order of how much they throw away:

| Mode | Removes |
|---|---|
| `start` | nothing |
| `destructive` | the container, the `/app` workspace volume, and the docker-in-docker volume |
| `purge` | all of the above plus every cache and credential volume under `/home/dev` |

**Before running `destructive` or `purge`, destroy any AWS infrastructure currently
deployed from the container.** With Terraform, local state lives in the workspace volume
and goes with it, leaving paid resources running and nothing to destroy them with. CDK is
safe here, because CloudFormation holds state server-side.

`destructive` keeps the `/home/dev` volumes on purpose — they are caches and credentials,
slow to rebuild and in the case of `~/.aws` and `~/.kube` hand-configured. The consequence
is that it is *not* a clean slate, so it is the wrong tool for verifying a new image: a
stale Gradle or Terraform plugin cache can make a regressed image look healthy. Use
`purge` for that, and expect the first start afterwards to be slow.

`~/.local/share/nvim` (Mason/LSP data) and `~/.local/share/pnpm` (the pnpm store) aren't
volumes at all, so both `destructive` and `purge` already give them a clean slate — a
re-fetch there has never been a problem in practice.

### Publish a new image

New images are built and published from inside a container. By default the image will be
tagged as `latest` for convenience as the priority and this should be the normal workflow.

```
docker login
./buildimage.sh # optional tag id param (see below)
```

For simplicity, testing the new container is done back in Windows. Clone this repository
again to a second directory and build a test container there under a different image name
and a different set of volume names — the same files listed in the Upstream section, which
is where this project's names live. Start the container and do whatever tests are required.

Start that test container with `purge` rather than `start`, so nothing carried over in a
cache can mask a fault in the image.

Run `./verify-toolchain.sh` to smoke-test every tool in one pass — offline by default; add
`--live` (after `aws sso login`) to also round-trip a real CDK deploy/destroy.

### Broken :latest tag

If you overwrite the `:latest` tag with something which doesn't produce a working
devcontainer then you can recover from a "fallback" tagged image that you can make by
using the optional parameter to the `buildimage.sh`. It is not necessary to do this
frequently, because even a very old tag will allow you to pull the project inside the
devcontainer and be back up to date to tweak whatever mistake you made.

You will need to update certain resources in order to make use of a "fallback" tag. This
path is not seamlessly catered for, but should be simple enough if you again follow the
file list in the Upstream section above.
