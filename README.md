# BayState — parent repository for BayStateApp & BayStateScraper

This repository holds the two projects as git submodules to provide a consistent dev environment across machines.

## Quick start

- Clone with submodules: `git clone --recurse-submodules https://github.com/Bay-State-Pet-and-Garden-Supply/BayState.git`
- Or after cloning: `git submodule update --init --recursive`

## Notes

- `BayStateApp` and `BayStateScraper` remain independent repositories (kept as submodules).
- To update submodules to their tracked branch: `git submodule update --remote --merge` (from parent repo).
