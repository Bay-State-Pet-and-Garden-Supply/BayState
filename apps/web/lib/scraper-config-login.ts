function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function scraperConfigRequiresLogin(config: unknown): boolean {
  if (!isRecord(config)) {
    return false;
  }

  if (config.requires_login === true) {
    return true;
  }

  if (config.login && isRecord(config.login)) {
    return true;
  }

  const loginKeywords = ['login', 'authenticate', 'sign_in', 'signin', 'password', 'username'];
  const workflows = Array.isArray(config.workflows) ? config.workflows : [];

  return workflows.some((step: unknown) => {
    if (!isRecord(step)) {
      return false;
    }

    const action = typeof step.action === 'string' ? step.action.toLowerCase() : '';
    if (loginKeywords.some((keyword) => action.includes(keyword))) {
      return true;
    }

    const paramsString = step.params ? JSON.stringify(step.params).toLowerCase() : '';
    return loginKeywords.some((keyword) => paramsString.includes(keyword));
  });
}
