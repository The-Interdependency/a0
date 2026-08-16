# A0 integrated runtime profile deprecation

Date: 2026-08-16  
Disposition: **DEPRECATED**

The current integrated profile failed its exact supported-producer gate:

- `edcmbone>=0.1.0` referenced an archived producer;
- `interdependent-lib` and PCEA were resolved from moving `@main` refs;
- current `interdependent-lib` convergence excluded the current UCNS producer.

The archived and moving default edges have been removed. PCEA is pinned to the
exact symmetric-runtime commit that survived its bounded tests. No current
EDCM or convergence adapter is substituted by name alone.

## Replacement

`The-Interdependency/a0-betatest` replaces this repository as the active
bounded instrument path. Its survived scope is reset boundaries, exact public
gonol handling, typed UCNS absence, route separation, and deterministic local
inscription. No feature-equivalence claim transfers.

## Historical source

The A0 code and its EDCMbone integration remain readable as historical
evidence. They are not an active install or deployment authority.

## hmmm

A future integrated runtime requires exact current producer commits, an EDCM
adapter tested against current EDCM, a compatible convergence package, and a
sealed boot test. Renaming an import is not migration.
