"""Approved Source Policy Gate.

Enforces that the runner only crawls approved source domains and only
returns images from approved asset domains. Disallowed domains are blocked
even if they mistakenly appear in an allowed list.
"""

from __future__ import annotations

import logging
from urllib.parse import urlparse

from scrapers.approved_sources.types import (
    ApprovedSourcePolicy,
    DISALLOWED_DOMAINS,
)

logger = logging.getLogger(__name__)


# =============================================================================
# Domain normalization
# =============================================================================


def normalize_domain(url_or_domain: str) -> str:
    """Extract and normalize a clean hostname from a URL or bare domain.

    Strips scheme, 'www.' prefix, path, query, fragment, port.
    """
    raw = url_or_domain.strip().lower()

    # If it looks like a URL, extract hostname
    if "://" in raw or raw.startswith("//"):
        try:
            parsed = urlparse(raw)
            hostname = parsed.hostname or raw
        except Exception:
            hostname = raw
    else:
        hostname = raw

    # Strip www. prefix
    if hostname.startswith("www."):
        hostname = hostname[4:]

    # Strip path/query/fragment
    for sep in ("/", "?", "#"):
        idx = hostname.find(sep)
        if idx != -1:
            hostname = hostname[:idx]

    # Strip port
    if ":" in hostname and "." in hostname:
        parts = hostname.rsplit(":", 1)
        if parts[1].isdigit():
            hostname = parts[0]

    return hostname


# =============================================================================
# Domain checks
# =============================================================================


def is_disallowed_domain(
    domain: str,
    disallowed: list[str] | None = None,
) -> bool:
    """Check if a domain is in the disallowed blocklist (suffix matching).

    Uses suffix matching so "images.amazon.com" is blocked by "amazon.com".
    Exact matches also block. Partial matches like "not-amazon.com" are NOT
    blocked.

    Args:
        domain: Raw domain or URL to check.
        disallowed: Custom disallowed list; defaults to DISALLOWED_DOMAINS.

    Returns:
        True if the domain is disallowed.
    """
    normalized = normalize_domain(domain)
    blocklist = disallowed if disallowed is not None else DISALLOWED_DOMAINS
    return any(
        normalized == d or normalized.endswith("." + d)
        for d in blocklist
    )


def is_domain_allowed(
    domain: str,
    policy: ApprovedSourcePolicy,
) -> bool:
    """Check if a domain is allowed by the source policy.

    Disallowed domains are always blocked, even if they appear in
    allowedDomains. If allowedDomains is empty and approvedSourcesOnly
    is False, any domain that is not disallowed passes.
    """
    normalized = normalize_domain(domain)

    # Always block disallowed domains
    if normalized in policy.disallowedDomains or is_disallowed_domain(normalized):
        return False

    # If specific allowed domains are configured, check with suffix matching
    if policy.allowedDomains:
        allowed_norm = [normalize_domain(d) for d in policy.allowedDomains]
        return any(
            normalized == d or normalized.endswith("." + d)
            for d in allowed_norm
        )

    # No allowed list — only approvedSourcesOnly matters
    if policy.approvedSourcesOnly:
        return False

    return True


def is_asset_domain_allowed(
    url_or_domain: str,
    policy: ApprovedSourcePolicy,
) -> bool:
    """Check if an asset/image URL domain is allowed.

    If allowedAssetDomains is empty and the source is not approved-only,
    any non-disallowed domain passes. If approved-only, only allowed
    asset domains pass.
    """
    normalized = normalize_domain(url_or_domain)

    # Always block disallowed domains
    if normalized in policy.disallowedDomains or is_disallowed_domain(normalized):
        return False

    if policy.allowedAssetDomains:
        allowed_norm = [normalize_domain(d) for d in policy.allowedAssetDomains]
        if any(
            normalized == d or normalized.endswith("." + d)
            for d in allowed_norm
        ):
            return True

    # Fallback/default whitelisted CDN domains for allowed approved sources
    TRUSTED_ASSET_DOMAINS = {
        "bigcommerce.com",
        "cloudinary.com",
        "salesforce.com",
        "force.com",
        "demandware.net",
        "demandware.store",
        "centralpet.com",
        "petfoodexperts.com",
        "media-amazon.com",
        "images-amazon.com",
        "amazon.com",
        "salsify.com",
        # Phillips Pet serves product imagery from this fixed CloudFront distribution.
        "d56ygyjv466yj.cloudfront.net",
    }
    if any(normalized == td or normalized.endswith("." + td) for td in TRUSTED_ASSET_DOMAINS):
        return True

    # Fall back to general domain check
    if policy.approvedSourcesOnly:
        if policy.allowedDomains:
            allowed_norm = [normalize_domain(d) for d in policy.allowedDomains]
            return any(
                normalized == d or normalized.endswith("." + d)
                for d in allowed_norm
            )
        return False

    return True


def validate_url_allowed(url: str, policy: ApprovedSourcePolicy) -> tuple[bool, str | None]:
    """Validate a full URL against the source policy.

    Returns:
        (True, None) if allowed, or (False, error_message) if blocked.
    """
    try:
        parsed = urlparse(url)
        domain = parsed.hostname or url
    except Exception:
        return False, f"Malformed URL: {url}"

    if not is_domain_allowed(domain, policy):
        return False, f"Domain '{domain}' is not allowed by source policy"

    return True, None


def validate_asset_url(url: str, policy: ApprovedSourcePolicy) -> tuple[bool, str | None]:
    """Validate an asset/image URL domain against the source policy.

    Returns:
        (True, None) if allowed, or (False, error_message) if blocked.
    """
    try:
        parsed = urlparse(url)
        domain = parsed.hostname or url
    except Exception:
        return False, f"Malformed asset URL: {url}"

    if not is_asset_domain_allowed(domain, policy):
        return False, f"Asset domain '{domain}' is not allowed by source policy"

    return True, None


def filter_allowed_assets(
    urls: list[str],
    policy: ApprovedSourcePolicy,
) -> list[str]:
    """Filter a list of asset/image URLs, keeping only policy-allowed ones."""
    allowed: list[str] = []
    for url in urls:
        ok, _ = validate_asset_url(url, policy)
        if ok:
            allowed.append(url)
        else:
            logger.warning("[Policy] Dropped disallowed asset URL: %s", url)
    return allowed


def check_disallowed_in_allowed(
    domains: list[str],
    policy: ApprovedSourcePolicy,
) -> list[str]:
    """Check if any domains in a list are disallowed, returning the offenders."""
    offenders: list[str] = []
    for d in domains:
        normalized = normalize_domain(d)
        if normalized in policy.disallowedDomains or is_disallowed_domain(normalized):
            offenders.append(d)
    return offenders
