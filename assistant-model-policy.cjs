'use strict';

// User-selected policy for the selection assistant only. Translation/topic
// chat environment settings deliberately cannot override this selection.
function assistantModelOptions() {
  return { model: 'gpt-6.1-sol', reasoningEffort: 'medium' };
}

module.exports = { assistantModelOptions };
