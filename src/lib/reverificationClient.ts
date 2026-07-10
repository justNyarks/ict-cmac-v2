import { verifySensitiveActionPassword } from '@/app/reverificationActions'

export const REVERIFICATION_REQUIRED_MESSAGE = 'Zero trust verification required'

type ReverificationPromptHandler = () => Promise<string | null>

let reverificationPromptHandler: ReverificationPromptHandler | null = null

export function registerReverificationPrompt(handler: ReverificationPromptHandler) {
  reverificationPromptHandler = handler

  return () => {
    if (reverificationPromptHandler === handler) {
      reverificationPromptHandler = null
    }
  }
}

function shouldPromptForReverification(message: string | null | undefined) {
  return message === REVERIFICATION_REQUIRED_MESSAGE
}

async function promptAndVerify() {
  const password = reverificationPromptHandler
    ? await reverificationPromptHandler()
    : window.prompt('Please re-enter your current signed-in account password to continue this sensitive change.')

  if (!password) {
    throw new Error('Re-verification was cancelled.')
  }

  const result = await verifySensitiveActionPassword({ password })

  if (!result.success) {
    throw new Error(result.error || 'Re-verification failed.')
  }
}

export async function runWithReverification<T>(
  operation: () => Promise<T>,
  getResultError?: (result: T) => string | null | undefined
) {
  try {
    const result = await operation()

    if (shouldPromptForReverification(getResultError?.(result))) {
      await promptAndVerify()
      return await operation()
    }

    return result
  } catch (error) {
    if (!(error instanceof Error) || !shouldPromptForReverification(error.message)) {
      throw error
    }

    await promptAndVerify()
    return await operation()
  }
}
