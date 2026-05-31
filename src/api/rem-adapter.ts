/**
 * RemNote API Adapter
 * Wraps the RemNote Plugin SDK with correct method signatures for v0.0.46+
 */

import {
  PropertyType,
  ReactRNPlugin,
  RichTextInterface,
  SetRemType,
  PluginRem
} from '@remnote/plugin-sdk';
import {
  DEFAULT_AUTO_TAG,
  DEFAULT_JOURNAL_PREFIX,
  DEFAULT_WS_URL,
  MCPSettings,
  SETTING_AUTO_TAG,
  SETTING_AUTO_TAG_ENABLED,
  SETTING_DEFAULT_PARENT,
  SETTING_JOURNAL_PREFIX,
  SETTING_JOURNAL_TIMESTAMP,
  SETTING_WS_URL,
  STORAGE_RUNTIME_STATUS,
  STORAGE_SIDEBAR_SHORTCUTS,
} from '../settings';
import { semanticEngine } from './semantic-engine';

const DEFAULT_POWERUP_CODES = [
  'l', 'a', 'at', 'm', 'c', 'd', 'u', 'dv', 'o', 's', 'e', 'j', 'x', 'r', 'h', 'b',
  'i', 'mc', 'w', 'pn', 'n', 'q', 'qt', 'rt', 'y', 'os', 'k', 'toc', 'tts', 'ew',
  'g', 't', 'f', 'p', 'z', 'cd', 'ty', 'de', 'sp', 'ct', 'hh', 'ha', 'id', 'im',
  'sd', 'clo'
];

const DEFAULT_POWERUP_SLOT_CODES: Record<string, string[]> = {
  l: ['Aliases'],
  ct: ['Template'],
  a: ['SortDirection'],
  cd: ['Language', 'DontWrap', 'DontBoundHeight'],
  d: ['Timestamp', 'Date'],
  e: ['Message'],
  r: ['Size'],
  h: ['Color'],
  b: ['URL', 'Title', 'ReadPercent', 'LastReadDate', 'FileURL'],
  n: ['Data', 'PdfId'],
  hh: ['Data', 'HTMLId'],
  rt: ['Date'],
  y: ['SelectTag', 'ExtraSlotsOnFrontOfCard', 'ExtraSlotsOnBackOfCard'],
  os: ['Sources'],
  at: ['Templates'],
  sp: ['Query', 'Filter', 'AutomaticBacklinkSearchPortalFor', 'DontIncludeNestedDescendants'],
  g: ['AutoActivate', 'Pinned', 'CollapseConfigure', 'PrimaryColumnName'],
  t: ['Status'],
  ew: ['URL', 'WIDTH', 'HEIGHT'],
  f: ['Type', 'URL', 'Name', 'Authors', 'Keywords', 'Title', 'ViewerData', 'ReadPercent', 'LastReadDate', 'HasNoTextLayer', 'Theme'],
  p: ['Data', 'Url'],
  z: ['Hostname'],
  clo: ['BulletIcon'],
  de: ['Topics', 'Status', 'MaxNewCardsPerDay', 'MaxTotalCardsPerDay', 'ExamSchedulerDate', 'RetrievabilityPeriodStartDate', 'ConsolidationPeriodStartDate', 'ConsolidationPeriodReIntroSectionLength', 'ExamConfig', 'SavedExamInfo', 'ExamSchedulerDesiredStability', 'ExamSchedulerMaxNewCardsPerDay', 'ExamSchedulerMaxTotalCardsPerDay', 'ExamSchedulerCollection'],
  im: ['Image'],
};

const KNOWN_APP_EVENT_IDS = [
  'focus.rem.change',
  'focus.portal.change',
  'setting.changed',
  'editor.selection.changed',
  'editor.text.edited',
  'fake_embed_component_dimension_change',
  'fake_embed_dom_event',
  'steal_key_event',
  'storage.session.change',
  'storage.synced.change',
  'storage.local.change',
  'queue.load-card',
  'queue.complete-card',
  'queue.enter',
  'queue.exit',
  'queue.reveal-answer',
  'global.open-rem',
  'global.url-change',
  'rem.changed',
  'global.rem.changed',
  'powerup.slot.changed',
  'powerup.click-rem-reference',
  'powerup.mouse-over-link',
  'powerup.mouse-out-link',
  'powerup.set-todo-status',
  'sidebar.click-sidebar-item',
  'messaging.message-broadcast',
  'window.focused-pane.change',
  'window.current-window-tree.change',
  'onActivate',
  'onDeactivate',
  'setDarkMode',
  'setCustomCSS',
];

export interface CreateNoteParams {
  title: string;
  content?: string;
  parentId?: string;
  tags?: string[];
  tagIds?: string[];
  isDocument?: boolean;
  headingLevel?: number;
  isQuote?: boolean;
  isList?: boolean;
}

export interface CreateLinkRemParams {
  url: string;
  addTitle?: boolean;
  parentId?: string;
  positionAmongstSiblings?: number;
  confirm?: string;
  dryRun?: boolean;
  includeSummary?: boolean;
  allowUnsafeScheme?: boolean;
}

export interface AppendJournalParams {
  content: string;
  timestamp?: boolean;
}

export interface SearchParams {
  query: string;
  limit?: number;
  includeContent?: boolean;
  searchContextRemId?: string;
  searchMode?: 'normal' | 'deep';
}

export interface ReadNoteParams {
  remId: string;
  depth?: number;
}

export interface ListChildrenParams {
  remId: string;
  limit?: number;
}

export interface UpdateNoteParams {
  remId: string;
  title?: string;
  headingLevel?: number;
  appendContent?: string;
  addTags?: string[];
  removeTags?: string[];
}

export interface MoveNoteParams {
  remId: string;
  parentId?: string | null;
  positionAmongstSiblings?: number;
}

export interface DeleteNoteParams {
  remId: string;
}

export interface OverwriteNoteContentParams {
  remId: string;
  content: string;
  headingLevel?: number;
}

export interface CreateStructuredSummaryParams {
  parentId?: string;
  title: string;
  headingLevel?: number;
  tags?: string[];
  sections: Array<{
    heading: string;
    body: string;
    imageUrls?: string[];
  }>;
}

export interface CreateTableParams {
  title?: string;
  parentId?: string;
  existingTagId?: string;
  tags?: string[];
}

export interface CreatePropertyParams {
  parentTagId: string;
  name: string;
  propertyType?: string;
  options?: string[];
  strictPropertyType?: boolean;
}

export interface SetTagPropertyValueParams {
  remId: string;
  propertyId: string;
  value?: string;
}

export interface GetPropertyInfoParams {
  propertyId: string;
}

export interface SetPropertyTypeParams {
  propertyId: string;
  propertyType: string;
}

export interface CreateTemplateParams {
  tagId: string;
  title: string;
  content?: string;
  autoApply?: boolean;
}

export interface SetTemplateAutoApplyParams {
  templateId: string;
  autoApply?: boolean;
}

export interface ListTagTemplatesParams {
  tagId: string;
}

export interface ApplyTemplateToRemParams {
  remId: string;
  templateId: string;
  tagId?: string;
  skipExistingChildTitles?: boolean;
  propertyDefaults?: Record<string, string>;
}

export interface ApplyTagAutoTemplateParams {
  remId: string;
  tagId: string;
  templateTitle?: string;
  skipExistingChildTitles?: boolean;
  propertyDefaults?: Record<string, string>;
}

export interface RemSdkCallParams {
  remId: string;
  method: string;
  args?: unknown[];
}

export interface RemRawCallParams {
  remId: string;
  method: string;
  payload?: Record<string, unknown>;
}

export interface SdkNamespaceCallParams {
  namespace: string;
  method: string;
  args?: unknown[];
  valueDepth?: number;
}

export interface InspectAppContextParams {
  includeSyncProbe?: boolean;
  syncTimeoutMs?: number;
  valueDepth?: number;
}

export interface ControlAppParams {
  operation?: 'status' | 'waitForInitialSync' | 'transactionProbe' | 'toast' | 'registerCSS' | 'registerStatusBarItem' | 'stealKeys' | 'releaseKeys' | 'registerWidget' | 'unregisterWidget' | 'registerCommand' | 'registerSidebarButton' | 'registerRemMenuItem' | 'registerMenuItem' | 'unregisterMenuItem' | 'registerCallback' | 'registerPowerup';
  confirm?: string;
  dryRun?: boolean;
  valueDepth?: number;
  syncTimeoutMs?: number;
  message?: string;
  id?: string;
  css?: string;
  html?: string;
  keys?: string[];
  fileName?: string;
  location?: string;
  options?: Record<string, unknown>;
  command?: Record<string, unknown>;
  menuItem?: Record<string, unknown>;
  callbackId?: string;
  name?: string;
  code?: string;
  description?: string;
}

export interface ControlWindowParams {
  operation?: 'status' | 'isFloatingWidgetOpen' | 'setFocusedPaneId' | 'setURL' | 'openRem' | 'setRemWindowTree' | 'setCurrentWindowTreeFromString' | 'openFloatingWidget' | 'closeFloatingWidget' | 'setFloatingWidgetPosition' | 'closeAllFloatingWidgets' | 'stealKeys' | 'releaseKeys' | 'openWidgetInPane' | 'openWidgetInRightSidebar';
  confirm?: string;
  dryRun?: boolean;
  valueDepth?: number;
  paneId?: string;
  url?: string;
  remId?: string;
  tree?: Record<string, unknown>;
  treeString?: string;
  fileName?: string;
  floatingWidgetId?: string;
  position?: Record<string, unknown>;
  classContainer?: string;
  closeWhenClickOutside?: boolean;
  keys?: string[];
  contextData?: Record<string, unknown>;
}

export interface InspectEditorContextParams {
  includeFocusedText?: boolean;
  valueDepth?: number;
}

export interface ControlEditorParams extends RichTextInputParams {
  operation?: 'status' | 'setText' | 'copy' | 'cut' | 'deleteCharacters' | 'delete' | 'selectRem' | 'selectText' | 'collapseSelection' | 'undo' | 'redo' | 'moveCaret' | 'moveCaretVertical' | 'insertPlainText' | 'insertRichText' | 'insertMarkdown';
  confirm?: string;
  dryRun?: boolean;
  includeFocusedText?: boolean;
  valueDepth?: number;
  remIds?: string[];
  portalId?: string;
  range?: unknown;
  characters?: number;
  direction?: -1 | 1 | number;
  to?: 'start' | 'end';
  amount?: number;
  unit?: number | string;
}

export interface InspectQueueContextParams {
  includeCurrentCard?: boolean;
  valueDepth?: number;
}

export interface ControlPracticeQueueParams {
  operation?: 'status' | 'showAnswer' | 'rateCurrentCard' | 'goBackToPreviousCard' | 'removeCurrentCardFromQueue';
  score?: number | string;
  addToBackStack?: boolean;
  dryRun?: boolean;
  confirm?: string;
  includeCurrentCard?: boolean;
  valueDepth?: number;
}

export interface ControlCardParams {
  operation?: 'status' | 'remove' | 'updateRepetitionStatus' | 'updateCardRepetitionStatus';
  cardId?: string;
  score?: number | string;
  dryRun?: boolean;
  confirm?: string;
  includeRem?: boolean;
  includeRepetitionHistory?: boolean;
  includeRawCard?: boolean;
  valueDepth?: number;
}

export interface InspectPluginRuntimeParams {
  includeSettings?: boolean;
  includeStorage?: boolean;
  includeKnowledgeBase?: boolean;
  settingIds?: string[];
  storageKeys?: string[];
  valueDepth?: number;
}

export interface ControlPluginRuntimeParams {
  operation?: 'status' | 'storageGet' | 'storageSet' | 'getSetting' | 'registerSetting' | 'getWidgetsAtLocation' | 'getWidgetContext' | 'getWidgetDimensions' | 'openPopup' | 'closePopup' | 'broadcast';
  confirm?: string;
  dryRun?: boolean;
  valueDepth?: number;
  storageArea?: 'session' | 'synced' | 'local';
  key?: string;
  value?: unknown;
  settingId?: string;
  settingType?: 'dropdown' | 'boolean' | 'string' | 'number';
  setting?: Record<string, unknown>;
  location?: string;
  remId?: string;
  widgetInstanceId?: number | string;
  fileName?: string;
  contextData?: unknown;
  clickOutsideToClose?: boolean;
  restoreFocus?: boolean;
  message?: unknown;
}

export interface InspectPowerupRegistryParams {
  powerupCodes?: string[];
  slotsByPowerupCode?: Record<string, string[]>;
  includeDefaultPowerups?: boolean;
  includeSlots?: boolean;
  powerupLimit?: number;
  slotLimit?: number;
  valueDepth?: number;
}

export interface ControlEventsParams {
  operation?: 'status' | 'addListener' | 'removeListener';
  eventId?: string;
  listenerKey?: string;
  confirm?: string;
  dryRun?: boolean;
  allowUntracked?: boolean;
  valueDepth?: number;
  maxRecentEvents?: number;
}

export interface ControlReaderParams {
  operation?: 'status' | 'addHighlight';
  confirm?: string;
  dryRun?: boolean;
  includeSummary?: boolean;
  valueDepth?: number;
}

export interface ControlSchedulerParams {
  operation?: 'status' | 'registerCustomScheduler';
  name?: string;
  parameters?: unknown[];
  confirm?: string;
  dryRun?: boolean;
  valueDepth?: number;
}

export interface InspectRemObjectStateParams {
  remId: string;
  portalId?: string;
  includeRelations?: boolean;
  includeContainerLists?: boolean;
  includePowerups?: boolean;
  includePowerupProperties?: boolean;
  powerupCodes?: string[];
  powerupSlotsByCode?: Record<string, string[]>;
  containerLimit?: number;
  valueDepth?: number;
}

export interface InspectRemGraphContextParams {
  remId: string;
  portalId?: string;
  includeSiblings?: boolean;
  includeTagContext?: boolean;
  includeReferences?: boolean;
  includeDeepReferences?: boolean;
  includeContainers?: boolean;
  limit?: number;
  valueDepth?: number;
}

export interface ControlRemObjectStateParams extends InspectRemObjectStateParams {
  operation?: 'status' | 'setListItem' | 'setCardItem' | 'setQuote' | 'setCode' | 'setTodo' | 'setTodoStatus' | 'setSlot' | 'setProperty' | 'setCollapsed' | 'setHiddenExplicitlyIncludedState' | 'expand' | 'collapse' | 'openRemInContext' | 'scrollToReaderHighlight' | 'copyReferenceToClipboard' | 'copyTagReferenceToClipboard' | 'copyPortalReferenceToClipboard';
  value?: boolean | string;
  todoStatus?: 'Finished' | 'Unfinished';
  hiddenState?: 'hidden' | 'included' | 'none';
  recurse?: boolean;
  confirm?: string;
  dryRun?: boolean;
}

export interface ControlRemStructureParams {
  remId: string;
  operation?: 'status' | 'indent' | 'outdent' | 'setType' | 'merge' | 'mergeAndSetAlias';
  targetRemId?: string;
  portalId?: string;
  remType?: string | number;
  includeBeforeAfter?: boolean;
  confirm?: string;
  dryRun?: boolean;
  allowDestructive?: boolean;
  destructiveConfirm?: string;
  valueDepth?: number;
}

export interface InspectFocusContextParams {
  valueDepth?: number;
}

export interface RichTextInputParams {
  richText?: RichTextInterface;
  text?: string;
  markdown?: string;
}

export interface RichTextParseMarkdownParams {
  markdown: string;
  includeMarkdown?: boolean;
  includeHtml?: boolean;
  includeString?: boolean;
  valueDepth?: number;
}

export interface RichTextFormatRangeParams extends RichTextInputParams {
  start?: number;
  end?: number;
  format: string;
  mode?: 'apply' | 'remove' | 'toggle';
  includeMarkdown?: boolean;
  includeHtml?: boolean;
  includeString?: boolean;
  valueDepth?: number;
}

export interface RichTextInspectParams extends RichTextInputParams {
  character?: string;
  start?: number;
  end?: number;
  allowSpaces?: boolean;
  includeHtml?: boolean;
  includeMarkdown?: boolean;
  includeReferences?: boolean;
  valueDepth?: number;
}

export interface RichTextInsertHtmlParams {
  remId: string;
  html: string;
  confirm?: string;
  dryRun?: boolean;
  includeBeforeAfter?: boolean;
  childLimit?: number;
  maxHtmlLength?: number;
  allowUnsafeHtml?: boolean;
  valueDepth?: number;
}

export interface CapabilityInspectorParams {
  actions?: string[];
}

export interface SafeMigrationPlanOperation {
  id?: string;
  action: string;
  payload?: Record<string, unknown>;
}

export interface SafeMigrationPlanParams {
  operations: SafeMigrationPlanOperation[];
  maxOperations?: number;
  includeSnapshots?: boolean;
}

export interface SafeMigrationApplyParams extends SafeMigrationPlanParams {
  confirm?: string;
  allowHighRisk?: boolean;
  allowDelete?: boolean;
  stopOnError?: boolean;
  auditMode?: string;
  auditContext?: Record<string, unknown>;
}

export interface SafeMigrationAuditLogParams {
  limit?: number;
  auditId?: string;
  includePlans?: boolean;
}

export interface SafeMigrationValidateRollbackParams {
  auditId?: string;
  rollbackPlan?: SafeMigrationPlanOperation[];
  includeSnapshots?: boolean;
  maxOperations?: number;
}

export interface SafeMigrationApplyRollbackParams extends SafeMigrationValidateRollbackParams {
  confirm?: string;
  allowHighRisk?: boolean;
  allowDelete?: boolean;
  stopOnError?: boolean;
}

export interface GetAllRemsParams {
  limit?: number;
  offset?: number;
  query?: string;
  sortBy?: 'createdAt' | 'updatedAt' | 'localUpdatedAt' | 'title';
  direction?: 'asc' | 'desc';
  includeTypeFlags?: boolean;
  includePowerups?: boolean;
}

export interface ExportVaultSnapshotParams {
  limit?: number;
  offset?: number;
  sortBy?: 'createdAt' | 'updatedAt' | 'localUpdatedAt' | 'title';
  direction?: 'asc' | 'desc';
  includeRawText?: boolean;
  includeBackText?: boolean;
  includeTypeFlags?: boolean;
  includePowerups?: boolean;
  includeRelations?: boolean;
  relationMode?: 'counts' | 'ids' | 'summaries';
  maxRelationSummaries?: number;
  includeProperties?: boolean;
  includePracticeData?: boolean;
  includeCards?: boolean;
  valueDepth?: number;
}

export interface ReadRemFullParams {
  remId: string;
  includeChildren?: boolean;
  includeRelations?: boolean;
  includeProperties?: boolean;
  childLimit?: number;
}

export interface ProbeRemIdsParams {
  remIds: string[];
  maxIds?: number;
  includeMissing?: boolean;
  includeTypeFlags?: boolean;
  includePowerups?: boolean;
  includeRelations?: boolean;
  includeProperties?: boolean;
}

export interface ExportSubtreeParams {
  remId: string;
  depth?: number;
  maxNodes?: number;
  includeRelations?: boolean;
}

export interface ExportTagViewParams {
  tagRemId: string;
  limit?: number;
  sortBy?: 'createdAt' | 'updatedAt' | 'localUpdatedAt' | 'title';
  direction?: 'asc' | 'desc';
  includeProperties?: boolean;
  propertyIds?: string[];
}

export interface ExportDailyRangeParams {
  startDate: string;
  endDate: string;
  depth?: number;
  includeChildren?: boolean;
  maxDays?: number;
}

export interface ExportGraphEdgesParams {
  remIds?: string[];
  rootRemId?: string;
  includeDescendants?: boolean;
  maxNodes?: number;
  includeTags?: boolean;
  includeReferences?: boolean;
  includeSources?: boolean;
  includePortals?: boolean;
}

export interface RemNoteDoctorScanParams {
  remIds?: string[];
  rootRemId?: string;
  tagRemId?: string;
  limit?: number;
  datePropertyId?: string;
}

export interface RemNoteDoctorRepairPlanParams extends RemNoteDoctorScanParams {
  includeDateBackfill?: boolean;
  includeBlankChildDeletes?: boolean;
  includeSafeMigrationPlan?: boolean;
  maxOperations?: number;
}

export interface ApplyRemNoteDoctorRepairsParams extends RemNoteDoctorRepairPlanParams {
  confirm?: string;
  allowHighRisk?: boolean;
  allowDelete?: boolean;
  stopOnError?: boolean;
}

export interface RemIdPairParams {
  remId: string;
  targetRemId?: string;
  tagId?: string;
  sourceRemId?: string;
  portalId?: string;
}

export interface RemoveTagByIdParams {
  remId: string;
  tagId: string;
  removeProperties?: boolean;
}

export interface CreateAliasParams {
  remId: string;
  aliasText: string;
}

export interface SetPracticeStateParams {
  remId: string;
  enablePractice?: boolean;
  direction?: 'forward' | 'backward' | 'none' | 'both';
}

export interface ExportPracticeQueueParams {
  remIds?: string[];
  parentId?: string;
  tagRemId?: string;
  query?: string;
  limit?: number;
  maxScan?: number;
  includeBackText?: boolean;
  includeCardDetails?: boolean;
  sortBy?: 'lastPracticed' | 'lastTimeMovedTo' | 'updatedAt' | 'createdAt' | 'title';
  direction?: 'asc' | 'desc';
}

export interface ExportCardCatalogParams {
  cardIds?: string[];
  remIds?: string[];
  type?: string;
  limit?: number;
  offset?: number;
  maxScan?: number;
  sortBy?: 'createdAt' | 'nextRepetitionTime' | 'lastRepetitionTime' | 'remId' | 'cardId' | 'type';
  direction?: 'asc' | 'desc';
  dueBefore?: number;
  dueAfter?: number;
  createdAfter?: number;
  createdBefore?: number;
  includeRem?: boolean;
  includeRepetitionHistory?: boolean;
  includeRawCard?: boolean;
  valueDepth?: number;
}

export interface ReadCardFullParams {
  cardId?: string;
  remId?: string;
  includeRem?: boolean;
  includeRepetitionHistory?: boolean;
  includeRawCard?: boolean;
  valueDepth?: number;
}

export interface ExportLearningInboxParams {
  learningTagId?: string;
  datePropertyId?: string;
  statusPropertyId?: string;
  priorityPropertyId?: string;
  domainPropertyId?: string;
  limit?: number;
  maxScan?: number;
  sortBy?: 'learnedAt' | 'createdAt' | 'updatedAt' | 'localUpdatedAt' | 'title' | 'status' | 'priority';
  direction?: 'asc' | 'desc';
  includeArchived?: boolean;
  includePractice?: boolean;
  includeBackText?: boolean;
  maxPracticeCardsPerRem?: number;
}

export interface PlanLearningInboxRepairsParams extends ExportLearningInboxParams {
  defaultStatus?: string;
  defaultPriority?: string;
  defaultDomain?: string;
  backfillDateFromCreatedAt?: boolean;
  includeSafeMigrationPlan?: boolean;
  includeCardDrafts?: boolean;
  maxOperations?: number;
}

export interface ApplyLearningInboxRepairsParams extends PlanLearningInboxRepairsParams {
  confirm?: string;
  stopOnError?: boolean;
}

export interface SetTableFilterRawParams {
  remId: string;
  filter?: unknown;
  dryRun?: boolean;
}

export interface IndexedDbInventoryParams {
  databaseName?: string;
  includeCounts?: boolean;
  includeSamples?: boolean;
  sampleLimit?: number;
  valueDepth?: number;
}

export interface IndexedDbReadStoreParams {
  databaseName: string;
  storeName: string;
  limit?: number;
  offset?: number;
  includeValues?: boolean;
  valueDepth?: number;
}

export interface NoteChild {
  remId: string;
  text: string;
  children: NoteChild[];
}

export interface SearchResultItem {
  remId: string;
  title: string;
  preview: string;
  content?: string;
  semanticScore?: number;
  matchSource?: 'exact' | 'fuzzy' | 'semantic' | 'hybrid';
  resultType?: 'note' | 'index' | 'question_bank' | 'raw_capture' | 'reflection' | 'longform';
  duplicateCount?: number;
}

const PROPERTY_TYPE_ALIASES: Record<string, PropertyType> = {
  implicit_text: PropertyType.IMPLICIT_TEXT,
  'implicit text': PropertyType.IMPLICIT_TEXT,
  number: PropertyType.NUMBER,
  title: PropertyType.DEPRECATED_TITLE,
  text: PropertyType.TEXT,
  checkbox: PropertyType.CHECKBOX,
  date: PropertyType.DATE,
  multi_select: PropertyType.MULTI_SELECT,
  'multi select': PropertyType.MULTI_SELECT,
  multiselect: PropertyType.MULTI_SELECT,
  single_select: PropertyType.SINGLE_SELECT,
  'single select': PropertyType.SINGLE_SELECT,
  singleselect: PropertyType.SINGLE_SELECT,
  created_at: PropertyType.CREATED_AT,
  'created at': PropertyType.CREATED_AT,
  createdat: PropertyType.CREATED_AT,
  last_updated: PropertyType.LAST_UPDATED,
  'last updated': PropertyType.LAST_UPDATED,
  lastupdated: PropertyType.LAST_UPDATED,
  image: PropertyType.IMAGE,
  url: PropertyType.URL,
  definition: PropertyType.DEFINITION,
};

const SDK_REM_METHOD_ALLOWLIST = new Set([
  'addPowerup',
  'addSource',
  'addTag',
  'addToPortal',
  'allRemInDocumentOrPortal',
  'allRemInFolderQueue',
  'ancestorTagRem',
  'collapse',
  'copyPortalReferenceToClipboard',
  'copyReferenceToClipboard',
  'copyTagReferenceToClipboard',
  'descendantTagRem',
  'deepRemsBeingReferenced',
  'embeddedQueueViewMode',
  'expand',
  'getAliases',
  'getCards',
  'getChildrenRem',
  'getDescendants',
  'getEnablePractice',
  'getFontSize',
  'getHiddenExplicitlyIncludedState',
  'getHighlightColor',
  'getLastPracticed',
  'getLastTimeMovedTo',
  'getParentRem',
  'getPortalDirectlyIncludedRem',
  'getPortalType',
  'getPowerupProperty',
  'getPowerupPropertyAsRem',
  'getPowerupPropertyAsRichText',
  'getPracticeDirection',
  'getPropertyType',
  'getSchemaVersion',
  'getSources',
  'getTagPropertyAsRem',
  'getTagPropertyValue',
  'getTagRems',
  'getTodoStatus',
  'getType',
  'hasPowerup',
  'indent',
  'isCardItem',
  'isCode',
  'isCollapsed',
  'isDocument',
  'isFolder',
  'isListItem',
  'isPowerup',
  'isPowerupEnum',
  'isPowerupProperty',
  'isPowerupPropertyListItem',
  'isPowerupSlot',
  'isProperty',
  'isQuote',
  'isSlot',
  'isTable',
  'isTodo',
  'merge',
  'mergeAndSetAlias',
  'openRemAsPage',
  'openRemInContext',
  'outdent',
  'portalsAndDocumentsIn',
  'positionAmongstSiblings',
  'positionAmongstVisibleSiblings',
  'removePowerup',
  'removeSource',
  'removeTag',
  'removeFromPortal',
  'remsBeingReferenced',
  'remsReferencingThis',
  'scrollToReaderHighlight',
  'setEnablePractice',
  'setFontSize',
  'setHiddenExplicitlyIncludedState',
  'setHighlightColor',
  'setIsCardItem',
  'setIsCode',
  'setIsCollapsed',
  'setIsDocument',
  'setIsFolder',
  'setIsListItem',
  'setIsProperty',
  'setIsQuote',
  'setIsSlot',
  'setIsTodo',
  'setParent',
  'setPowerupProperty',
  'setPracticeDirection',
  'setTableFilter',
  'setTagPropertyValue',
  'setTodoStatus',
  'setType',
  'siblingRem',
  'taggedRem',
  'timesSelectedInSearch',
  'visibleSiblingRem',
]);

const RAW_REM_CALL_ALLOWLIST = new Set([
  'getHiddenExplicitlyIncludedState',
  'getPowerupProperty',
  'getPowerupPropertyAsRichText',
  'getPropertyType',
  'getTagPropertyValue',
  'setHiddenExplicitlyIncludedState',
  'setPowerupProperty',
  'setTagPropertyValue',
  'setTableFilter',
]);

const SDK_NAMESPACE_READ_ALLOWLIST: Record<string, Set<string>> = {
  app: new Set([
    'getOperatingSystem',
    'getPlatform',
  ]),
  date: new Set([
    'getTodaysDoc',
  ]),
  editor: new Set([
    'getCaretPosition',
    'getFocusedEditorText',
    'getSelectedRem',
    'getSelectedText',
    'getSelection',
  ]),
  queue: new Set([
    'getAverageTimePerCard',
    'getCurrentCard',
    'getCurrentQueueScreenType',
    'getCurrentStreak',
    'getNumRemainingCards',
    'hasRevealedAnswer',
    'inLookbackMode',
    'isTypeAnswerEnabled',
  ]),
  storage: new Set([
    'getLocal',
    'getSession',
    'getSynced',
  ]),
  settings: new Set([
    'getSetting',
  ]),
  kb: new Set([
    'getCurrentKnowledgeBaseData',
    'isPrimaryKnowledgeBase',
  ]),
  focus: new Set([
    'getFocusedPortal',
    'getFocusedRem',
  ]),
  card: new Set([
    'findMany',
    'findOne',
    'getAll',
  ]),
  powerup: new Set([
    'getPowerupByCode',
    'getPowerupSlotByCode',
  ]),
  window: new Set([
    'getCurrentWindowTree',
    'getFocusedPaneId',
    'getLastFocusedPane',
    'getOpenPaneIds',
    'getOpenPaneRemId',
    'getOpenPaneRemIds',
    'getURL',
    'isFloatingWidgetOpen',
    'isOnPage',
  ]),
  richText: new Set([
    'applyTextFormatToRange',
    'charAt',
    'deepGetRemAndAliasIdsFromRichText',
    'deepGetRemIdsFromRichText',
    'empty',
    'equals',
    'findAllExternalURLs',
    'getRemAndAliasIdsFromRichText',
    'getRemIdsFromRichText',
    'indexOf',
    'indexOfElementAt',
    'length',
    'normalize',
    'parseFromMarkdown',
    'removeTextFormatFromRange',
    'replaceAllRichText',
    'split',
    'splitRichText',
    'substring',
    'toHTML',
    'toMarkdown',
    'toString',
    'toggleTextFormatOnRange',
    'trim',
    'trimEnd',
    'trimStart',
  ]),
};

export interface CreateFlashcardParams {
  parentId: string;
  front: string;
  back: string;
  type?: 'forward' | 'backward' | 'bidirectional';
  extraDetail?: string;
  detailToggles?: FlashcardDetailSection[];
  tags?: string[];
}

export interface FlashcardDetailSection {
  title: string;
  body?: string;
  children?: FlashcardDetailSection[];
  collapsed?: boolean;
}

export interface UpdateFlashcardBackParams {
  remId: string;
  back: string;
}

export interface AddPowerupParams {
  remId: string;
  powerup: string;
}

export interface CreatePortalParams {
  parentId: string;
  sourceRemId: string;
}

export interface CreateReferenceParams {
  remId: string;
  text: string;
  targetRemId: string;
}

export class RemAdapter {
  private settings: MCPSettings;
  private semanticInitStarted = false;
  private readonly SAFE_MIGRATION_AUDIT_LOG_KEY = 'mcp_safe_migration_audit_log_v1';
  private readonly eventListeners = new Map<string, {
    eventId: string;
    listenerKey?: string;
    callback: (event: unknown) => void;
    registeredAt: number;
    eventCount: number;
    lastEventAt?: number;
    recentEvents: unknown[];
  }>();

  constructor(private plugin: ReactRNPlugin, settings?: Partial<MCPSettings>) {
    // Default settings
    this.settings = {
      autoTagEnabled: true,
      autoTag: 'MCP',
      journalPrefix: '[Claude]',
      journalTimestamp: true,
      wsUrl: 'ws://127.0.0.1:3401',
      defaultParentId: '',
      ...settings
    };

    void this.ensureSemanticReady();
  }

  /**
   * Update settings dynamically
   */
  updateSettings(settings: Partial<MCPSettings>): void {
    this.settings = { ...this.settings, ...settings };
  }

  /**
   * Get current settings
   */
  getSettings(): MCPSettings {
    return { ...this.settings };
  }

  /**
   * Extract plain text from RichTextInterface
   */
  private extractText(richText: RichTextInterface | undefined): string {
    if (!richText || !Array.isArray(richText)) return '';

    return richText
      .map((element) => {
        if (typeof element === 'string') {
          return element;
        }
        // Handle rich text elements (references, formatting, etc.)
        if (element && typeof element === 'object' && 'text' in element) {
          return (element as { text?: string }).text || '';
        }
        return '';
      })
      .join('');
  }

  /**
   * Helper to safely get text from a Rem, handling potential async nature or proxy issues
   */
  private async getRemText(rem: PluginRem): Promise<string> {
    if (!rem) return '';
    // Try to get text directly if it's a property
    // In some SDK versions, properties might be async/promises
    let text: any = rem.text;

    // If it's a promise (some SDK versions/states), await it
    if (text instanceof Promise) {
      try {
        text = await text;
      } catch (e) {
        console.error("Error awaiting rem.text", e);
        return "";
      }
    }

    return this.extractText(text);
  }

  private normalizePropertyType(propertyType: string): PropertyType {
    const key = (propertyType || '').trim().toLocaleLowerCase('en-US').replace(/-/g, '_');
    const normalized = PROPERTY_TYPE_ALIASES[key] ?? PROPERTY_TYPE_ALIASES[key.replace(/_/g, ' ')];
    if (normalized === undefined) {
      throw new Error(`Unsupported property type: ${propertyType}`);
    }
    return normalized;
  }

  private async callRawRemMethod(rem: any, method: string, payload?: Record<string, unknown>): Promise<unknown> {
    if (!RAW_REM_CALL_ALLOWLIST.has(method)) {
      throw new Error(`Raw Rem method is not allowlisted: ${method}`);
    }
    if (typeof rem?.call !== 'function') {
      throw new Error('RemObject raw call is unavailable');
    }
    return rem.call(method, payload || {});
  }

  private async serializeForBridge(value: unknown, depth = 3): Promise<unknown> {
    if (value instanceof Promise) {
      return this.serializeForBridge(await value, depth);
    }
    if (value === null || value === undefined) return value;
    if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return value;
    if (depth <= 0) return '[MaxDepth]';

    if (Array.isArray(value)) {
      const rows = [];
      for (const item of value) {
        rows.push(await this.serializeForBridge(item, depth - 1));
      }
      return rows;
    }

    if (typeof value === 'object') {
      const maybeRem = value as Partial<PluginRem> & Record<string, unknown>;
      if (typeof maybeRem._id === 'string' && ('text' in maybeRem || typeof maybeRem.getChildrenRem === 'function')) {
        let title = '';
        try {
          title = await this.getRemText(maybeRem as unknown as PluginRem);
        } catch {
          title = '';
        }
        return {
          remId: maybeRem._id,
          title,
          createdAt: typeof maybeRem.createdAt === 'number' ? maybeRem.createdAt : undefined,
          updatedAt: typeof maybeRem.updatedAt === 'number' ? maybeRem.updatedAt : undefined,
          localUpdatedAt: typeof maybeRem.localUpdatedAt === 'number' ? maybeRem.localUpdatedAt : undefined,
          parentId: typeof maybeRem.parent === 'string' ? maybeRem.parent : null,
          type: maybeRem.type,
        };
      }

      const output: Record<string, unknown> = {};
      for (const [key, childValue] of Object.entries(value as Record<string, unknown>)) {
        if (typeof childValue === 'function') continue;
        if (key.startsWith('_') && key !== '_id') continue;
        output[key] = await this.serializeForBridge(childValue, depth - 1);
      }
      return output;
    }

    return String(value);
  }

  private async captureSdkRead(reader: () => Promise<unknown>, depth = 4): Promise<{
    ok: boolean;
    value?: unknown;
    error?: string;
  }> {
    try {
      return {
        ok: true,
        value: await this.serializeForBridge(await reader(), depth),
      };
    } catch (err) {
      return {
        ok: false,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }

  private eventListenerId(eventId: string, listenerKey?: string): string {
    return `${eventId}::${listenerKey || 'mcp-bridge'}`;
  }

  private async eventStatus(valueDepth = 4, maxRecentEvents = 5): Promise<Record<string, unknown>> {
    const listeners = [];
    for (const [listenerId, entry] of this.eventListeners.entries()) {
      listeners.push({
        listenerId,
        eventId: entry.eventId,
        listenerKey: entry.listenerKey,
        registeredAt: entry.registeredAt,
        eventCount: entry.eventCount,
        lastEventAt: entry.lastEventAt,
        recentEvents: await this.serializeForBridge(entry.recentEvents.slice(0, maxRecentEvents), valueDepth),
      });
    }
    return {
      activeListenerCount: listeners.length,
      listeners,
      knownEventIds: KNOWN_APP_EVENT_IDS,
    };
  }

  private recordPluginEvent(listenerId: string, event: unknown, valueDepth: number): void {
    const entry = this.eventListeners.get(listenerId);
    if (!entry) return;
    entry.eventCount += 1;
    entry.lastEventAt = Date.now();
    void this.serializeForBridge(event, valueDepth)
      .then((value) => {
        entry.recentEvents.unshift({
          receivedAt: entry.lastEventAt,
          value,
        });
        entry.recentEvents = entry.recentEvents.slice(0, 10);
      })
      .catch((err) => {
        entry.recentEvents.unshift({
          receivedAt: entry.lastEventAt,
          error: err instanceof Error ? err.message : String(err),
        });
        entry.recentEvents = entry.recentEvents.slice(0, 10);
      });
  }

  private async richTextFromParams(params: RichTextInputParams): Promise<RichTextInterface> {
    if (Array.isArray(params.richText)) {
      return params.richText;
    }
    if (typeof params.markdown === 'string') {
      return await this.plugin.richText.parseFromMarkdown(params.markdown);
    }
    if (typeof params.text === 'string') {
      return this.textToPlainRichText(params.text);
    }
    throw new Error('RichText input requires richText, markdown, or text.');
  }

  private async summarizeRichText(
    richText: RichTextInterface,
    options: {
      includeHtml?: boolean;
      includeMarkdown?: boolean;
      includeString?: boolean;
      includeReferences?: boolean;
      valueDepth?: number;
    } = {}
  ): Promise<Record<string, unknown>> {
    const valueDepth = this.clampLimit(options.valueDepth, 5, 8);
    const [length, empty, plainText] = await Promise.all([
      this.captureSdkRead(() => this.plugin.richText.length(richText), valueDepth),
      this.captureSdkRead(() => this.plugin.richText.empty(richText), valueDepth),
      this.captureSdkRead(() => this.plugin.richText.toString(richText), valueDepth),
    ]);
    const summary: Record<string, unknown> = {
      richText: await this.serializeForBridge(richText, valueDepth),
      length,
      empty,
      plainText,
    };
    if (options.includeString) {
      summary.string = plainText;
    }
    if (options.includeMarkdown) {
      summary.markdown = await this.captureSdkRead(() => this.plugin.richText.toMarkdown(richText), valueDepth);
    }
    if (options.includeHtml) {
      summary.html = await this.captureSdkRead(() => this.plugin.richText.toHTML(richText), valueDepth);
    }
    if (options.includeReferences) {
      summary.references = {
        remIds: await this.captureSdkRead(() => this.plugin.richText.getRemIdsFromRichText(richText), valueDepth),
        remAndAliasIds: await this.captureSdkRead(() => this.plugin.richText.getRemAndAliasIdsFromRichText(richText), valueDepth),
        deepRemIds: await this.captureSdkRead(() => this.plugin.richText.deepGetRemIdsFromRichText(richText), valueDepth),
        externalUrls: await this.captureSdkRead(() => this.plugin.richText.findAllExternalURLs(richText), valueDepth),
      };
    }
    return summary;
  }

  private inspectHtmlImportSafety(html: string, allowUnsafeHtml: boolean): Record<string, unknown> {
    const blockedTags = new Set([
      'script',
      'style',
      'iframe',
      'object',
      'embed',
      'link',
      'meta',
      'base',
      'form',
      'input',
      'button',
      'textarea',
      'select',
      'option',
    ]);
    const tagNames = new Set<string>();
    const blockedReasons = new Set<string>();
    const tagRegex = /<\/?\s*([a-zA-Z][\w:-]*)\b/g;
    let tagMatch: RegExpExecArray | null;
    while ((tagMatch = tagRegex.exec(html)) !== null) {
      const tagName = tagMatch[1].toLocaleLowerCase('en-US');
      tagNames.add(tagName);
      if (blockedTags.has(tagName)) {
        blockedReasons.add(`blocked_tag:${tagName}`);
      }
    }

    const eventAttrRegex = /\s(on[a-z]+)\s*=/ig;
    let attrMatch: RegExpExecArray | null;
    while ((attrMatch = eventAttrRegex.exec(html)) !== null) {
      blockedReasons.add(`event_attribute:${attrMatch[1].toLocaleLowerCase('en-US')}`);
    }

    const unsafeProtocolRegex = /\s(?:href|src)\s*=\s*["']?\s*(javascript:|vbscript:|data:)/ig;
    let protocolMatch: RegExpExecArray | null;
    while ((protocolMatch = unsafeProtocolRegex.exec(html)) !== null) {
      blockedReasons.add(`unsafe_protocol:${protocolMatch[1].toLocaleLowerCase('en-US').replace(':', '')}`);
    }

    const reasons = Array.from(blockedReasons).sort();
    return {
      ok: reasons.length === 0 || allowUnsafeHtml,
      allowUnsafeHtml,
      blockedReasonCount: reasons.length,
      blockedReasons: reasons,
      warnings: allowUnsafeHtml && reasons.length > 0
        ? ['allowUnsafeHtml=true bypassed the preflight block list; RemNote parser output should be inspected after import.']
        : [],
      scanned: {
        htmlLength: html.length,
        tagNames: Array.from(tagNames).sort(),
        tagCount: tagNames.size,
      },
    };
  }

  private async getHtmlImportSnapshot(
    rem: PluginRem,
    childLimit: number,
    valueDepth: number
  ): Promise<Record<string, unknown>> {
    const childIds = Array.isArray(rem.children) ? [...rem.children] : [];
    let children: PluginRem[] = [];
    try {
      children = await rem.getChildrenRem();
    } catch {
      children = [];
    }
    return {
      ...(await this.getRemSummary(rem, { includeTypeFlags: true, includePowerups: true })),
      childCount: childIds.length,
      childPreview: await Promise.all(children.slice(0, childLimit).map((child) => this.getRemSummary(child))),
      rawText: await this.captureSdkRead(() => this.getRawRichText(rem, 'text'), valueDepth),
    };
  }

  private getSnapshotChildIds(snapshot: Record<string, unknown> | undefined): string[] {
    const ids = snapshot?.childIds;
    return Array.isArray(ids) ? ids.filter((id): id is string => typeof id === 'string') : [];
  }

  private normalizeSchedulerParameters(parameters: unknown[] | undefined): Array<Record<string, unknown>> {
    if (parameters === undefined) return [];
    if (!Array.isArray(parameters)) {
      throw new Error('control_scheduler registerCustomScheduler parameters must be an array.');
    }
    if (parameters.length > 20) {
      throw new Error('control_scheduler registerCustomScheduler supports at most 20 parameters.');
    }

    const requiredString = (value: unknown, fieldName: string): string => {
      const text = typeof value === 'string' ? value.trim() : '';
      if (!text) throw new Error(`control_scheduler registerCustomScheduler parameter requires ${fieldName}.`);
      return text;
    };

    return parameters.map((parameter, index) => {
      if (!parameter || typeof parameter !== 'object' || Array.isArray(parameter)) {
        throw new Error(`control_scheduler registerCustomScheduler parameter ${index} must be an object.`);
      }
      const source = parameter as Record<string, unknown>;
      const type = requiredString(source.type, `parameters[${index}].type`).toLocaleLowerCase('en-US');
      if (!['number', 'string', 'dropdown', 'boolean'].includes(type)) {
        throw new Error(`control_scheduler registerCustomScheduler parameter ${index} type must be number, string, dropdown, or boolean.`);
      }

      const normalized: Record<string, unknown> = {
        type,
        id: requiredString(source.id, `parameters[${index}].id`),
        title: requiredString(source.title ?? source.name, `parameters[${index}].title`),
      };
      if (typeof source.description === 'string') {
        normalized.description = source.description;
      }

      if (type === 'number') {
        if (source.defaultValue !== undefined) {
          const value = Number(source.defaultValue);
          if (!Number.isFinite(value)) {
            throw new Error(`control_scheduler registerCustomScheduler parameter ${index} defaultValue must be numeric.`);
          }
          normalized.defaultValue = value;
        }
        if (Array.isArray(source.validators)) normalized.validators = source.validators;
      } else if (type === 'string') {
        if (source.defaultValue !== undefined) normalized.defaultValue = String(source.defaultValue);
        if (typeof source.multiline === 'boolean') normalized.multiline = source.multiline;
        if (Array.isArray(source.validators)) normalized.validators = source.validators;
      } else if (type === 'boolean') {
        if (source.defaultValue !== undefined) normalized.defaultValue = source.defaultValue === true;
      } else if (type === 'dropdown') {
        if (!Array.isArray(source.options) || source.options.length === 0) {
          throw new Error(`control_scheduler registerCustomScheduler parameter ${index} dropdown options must be a non-empty array.`);
        }
        normalized.options = source.options.map((option, optionIndex) => {
          if (!option || typeof option !== 'object' || Array.isArray(option)) {
            throw new Error(`control_scheduler registerCustomScheduler parameter ${index} option ${optionIndex} must be an object.`);
          }
          const optionRecord = option as Record<string, unknown>;
          return {
            key: requiredString(optionRecord.key ?? optionRecord.value, `parameters[${index}].options[${optionIndex}].key`),
            label: requiredString(optionRecord.label ?? optionRecord.key ?? optionRecord.value, `parameters[${index}].options[${optionIndex}].label`),
            value: requiredString(optionRecord.value ?? optionRecord.key, `parameters[${index}].options[${optionIndex}].value`),
          };
        });
        if (source.defaultValue !== undefined) normalized.defaultValue = String(source.defaultValue);
      }

      return normalized;
    });
  }

  private normalizeSdkNamespace(namespace: string): string {
    const key = (namespace || '').trim().toLocaleLowerCase('en-US');
    const aliases: Record<string, string> = {
      appnamespace: 'app',
      datenamespace: 'date',
      editornamespace: 'editor',
      focusnamespace: 'focus',
      cardnamespace: 'card',
      knowledge_base: 'kb',
      knowledgbase: 'kb',
      knowledgebase: 'kb',
      knowledgebasenamespace: 'kb',
      kbnamespace: 'kb',
      queuenamespace: 'queue',
      windownamespace: 'window',
      richtext: 'richText',
      richtextnamespace: 'richText',
      settingsnamespace: 'settings',
      storagenamespace: 'storage',
    };
    return aliases[key] || key;
  }

  private clampLimit(value: number | undefined, fallback: number, max: number): number {
    const raw = typeof value === 'number' && Number.isFinite(value) ? Math.floor(value) : fallback;
    return Math.max(1, Math.min(raw, max));
  }

  private async getIndexedDbDatabases(): Promise<Array<{ name: string; version?: number }>> {
    const idb = typeof indexedDB !== 'undefined' ? indexedDB as IDBFactory & {
      databases?: () => Promise<Array<{ name?: string; version?: number }>>;
    } : undefined;
    if (!idb?.databases) {
      throw new Error('IndexedDB database enumeration is unavailable in this RemNote runtime.');
    }

    const databases = await idb.databases();
    return databases
      .filter((entry) => typeof entry.name === 'string' && entry.name.length > 0)
      .map((entry) => ({ name: entry.name as string, version: entry.version }));
  }

  private async openExistingIndexedDb(databaseName: string): Promise<IDBDatabase> {
    const databases = await this.getIndexedDbDatabases();
    const match = databases.find((entry) => entry.name === databaseName);
    if (!match) {
      throw new Error(`IndexedDB database not found or not enumerable: ${databaseName}`);
    }

    return new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open(databaseName);
      request.onerror = () => reject(request.error || new Error(`Failed to open IndexedDB database: ${databaseName}`));
      request.onupgradeneeded = () => {
        try {
          request.transaction?.abort();
        } catch {
        }
        reject(new Error(`Refused to create or upgrade IndexedDB database: ${databaseName}`));
      };
      request.onsuccess = () => resolve(request.result);
      request.onblocked = () => reject(new Error(`IndexedDB database open blocked: ${databaseName}`));
    });
  }

  private async countIndexedDbStore(db: IDBDatabase, storeName: string): Promise<number> {
    return new Promise<number>((resolve, reject) => {
      try {
        const tx = db.transaction(storeName, 'readonly');
        const request = tx.objectStore(storeName).count();
        request.onerror = () => reject(request.error || new Error(`Failed to count store: ${storeName}`));
        request.onsuccess = () => resolve(request.result);
        tx.onerror = () => reject(tx.error || new Error(`IndexedDB transaction failed for store: ${storeName}`));
      } catch (err) {
        reject(err);
      }
    });
  }

  private async readIndexedDbStoreRows(
    db: IDBDatabase,
    storeName: string,
    options: { limit: number; offset: number; includeValues: boolean; valueDepth: number }
  ): Promise<Array<Record<string, unknown>>> {
    const rawRows = await new Promise<Array<Record<string, unknown>>>((resolve, reject) => {
      const rows: Array<Record<string, unknown>> = [];
      let skipped = 0;
      try {
        const tx = db.transaction(storeName, 'readonly');
        const request = tx.objectStore(storeName).openCursor();
        request.onerror = () => reject(request.error || new Error(`Failed to read store: ${storeName}`));
        request.onsuccess = () => {
          const cursor = request.result;
          if (!cursor || rows.length >= options.limit) {
            resolve(rows);
            return;
          }
          if (skipped < options.offset) {
            skipped += 1;
            cursor.continue();
            return;
          }
          rows.push({
            key: cursor.key,
            primaryKey: cursor.primaryKey,
            ...(options.includeValues ? { value: cursor.value } : {}),
          });
          cursor.continue();
        };
        tx.onerror = () => reject(tx.error || new Error(`IndexedDB transaction failed for store: ${storeName}`));
      } catch (err) {
        reject(err);
      }
    });

    const rows: Array<Record<string, unknown>> = [];
    for (const row of rawRows) {
      rows.push(await this.serializeForBridge(row, options.valueDepth) as Record<string, unknown>);
    }
    return rows;
  }

  private async getRawRichText(rem: PluginRem, field: 'text' | 'backText'): Promise<unknown> {
    let value: unknown = (rem as unknown as Record<string, unknown>)[field];
    if (value instanceof Promise) {
      value = await value;
    }
    return this.serializeForBridge(value, 5);
  }

  private async getRemSummary(
    rem: PluginRem,
    options: { includeTypeFlags?: boolean; includePowerups?: boolean } = {}
  ): Promise<Record<string, unknown>> {
    const title = await this.getRemText(rem);
    const summary: Record<string, unknown> = {
      remId: rem._id,
      title,
      createdAt: rem.createdAt,
      updatedAt: rem.updatedAt,
      localUpdatedAt: rem.localUpdatedAt,
      parentId: rem.parent ?? null,
      childIds: Array.isArray(rem.children) ? rem.children : [],
      type: rem.type,
    };

    if (options.includeTypeFlags) {
      summary.flags = await this.getRemTypeFlags(rem);
    }
    if (options.includePowerups) {
      summary.activePowerups = await this.getActivePowerupCodes(rem);
    }

    return summary;
  }

  private async getRemTypeFlags(rem: PluginRem): Promise<Record<string, unknown>> {
    const entries: Array<[string, () => Promise<unknown>]> = [
      ['isDocument', () => rem.isDocument()],
      ['isFolder', () => rem.isFolder()],
      ['isTable', () => rem.isTable()],
      ['isProperty', () => rem.isProperty()],
      ['isPowerup', () => rem.isPowerup()],
      ['isTodo', () => rem.isTodo()],
      ['isQuote', () => rem.isQuote()],
      ['isCode', () => rem.isCode()],
      ['isListItem', () => rem.isListItem()],
      ['isCardItem', () => rem.isCardItem()],
    ];

    const flags: Record<string, unknown> = {};
    for (const [key, fn] of entries) {
      try {
        flags[key] = await fn();
      } catch (err) {
        flags[`${key}Error`] = err instanceof Error ? err.message : String(err);
      }
    }
    return flags;
  }

  private sortRemSummaries<T extends { title?: string; createdAt?: number; updatedAt?: number; localUpdatedAt?: number }>(
    rows: T[],
    sortBy: string | undefined,
    direction: string | undefined
  ): T[] {
    const key = sortBy === 'title' || sortBy === 'createdAt' || sortBy === 'localUpdatedAt' ? sortBy : 'updatedAt';
    const dir = direction === 'asc' ? 'asc' : 'desc';
    return [...rows].sort((a, b) => {
      if (key === 'title') {
        const cmp = String(a.title || '').localeCompare(String(b.title || ''), 'tr');
        return dir === 'asc' ? cmp : -cmp;
      }
      const av = typeof a[key] === 'number' ? a[key] || 0 : 0;
      const bv = typeof b[key] === 'number' ? b[key] || 0 : 0;
      return dir === 'asc' ? av - bv : bv - av;
    });
  }

  private async getDirectPropertyChildren(tagRem: PluginRem): Promise<Array<{ remId: string; title: string }>> {
    const children = await tagRem.getChildrenRem();
    const properties: Array<{ remId: string; title: string }> = [];
    for (const child of children) {
      try {
        if (await child.isProperty()) {
          properties.push({ remId: child._id, title: await this.getRemText(child) });
        }
      } catch {
        // Ignore children that cannot be inspected as properties.
      }
    }
    return properties;
  }

  private async getActivePowerupCodes(rem: PluginRem, codes: string[] = ['m', 'at', 'g', 'o', 'de', 't', 'h', 'r', 'a', 'y']): Promise<string[]> {
    const active: string[] = [];
    for (const code of codes) {
      try {
        if (await rem.hasPowerup(code)) active.push(code);
      } catch {
        // Ignore powerups not understood by this RemNote runtime.
      }
    }
    return active;
  }

  private normalizeStringArray(value: unknown, fallback: string[], limit: number): string[] {
    const raw = Array.isArray(value) ? value : fallback;
    const normalized = raw
      .filter((item): item is string => typeof item === 'string')
      .map((item) => item.trim())
      .filter(Boolean);
    return Array.from(new Set(normalized)).slice(0, Math.max(0, limit));
  }

  private async summarizeRemArray(rows: PluginRem[] | undefined, limit: number): Promise<Record<string, unknown>> {
    const items = Array.isArray(rows) ? rows : [];
    const returned = Math.min(items.length, Math.max(0, limit));
    const summaries = [];
    for (const rem of items.slice(0, returned)) {
      summaries.push(await this.getRemSummary(rem));
    }
    return {
      count: items.length,
      returned,
      truncated: items.length > returned,
      rows: summaries,
    };
  }

  private parseSetRemType(value: string | number | undefined): SetRemType {
    if (typeof value === 'number') {
      if (value === SetRemType.DEFAULT_TYPE || value === SetRemType.CONCEPT || value === SetRemType.DESCRIPTOR) {
        return value;
      }
    }

    const normalized = String(value ?? '')
      .trim()
      .toLocaleLowerCase('en-US')
      .replace(/[\s-]+/g, '_');
    if (normalized === '0' || normalized === 'default' || normalized === 'default_type') return SetRemType.DEFAULT_TYPE;
    if (normalized === '1' || normalized === 'concept') return SetRemType.CONCEPT;
    if (normalized === '2' || normalized === 'descriptor') return SetRemType.DESCRIPTOR;
    throw new Error('control_rem_structure setType requires remType=DEFAULT_TYPE|CONCEPT|DESCRIPTOR.');
  }

  private async cloneRemSubtree(source: PluginRem, parent: PluginRem, positionAmongstSiblings?: number): Promise<PluginRem | undefined> {
    const clone = await this.plugin.rem.createRem();
    if (!clone) return undefined;

    const sourceText = source.text || this.textToPlainRichText(await this.getRemText(source));
    await clone.setText(sourceText);
    if (source.backText) {
      await clone.setBackText(source.backText);
    }

    try {
      await clone.setType(await source.getType() as any);
    } catch {
      // Type cloning is best-effort because not all Rem types are settable.
    }

    for (const copier of [
      async () => { if (await source.isDocument()) await clone.setIsDocument(true); },
      async () => { if (await source.isListItem()) await clone.setIsListItem(true); },
      async () => { if (await source.isCardItem()) await clone.setIsCardItem(true); },
      async () => { if (await source.isQuote()) await clone.setIsQuote(true); },
      async () => { if (await source.isCode()) await clone.setIsCode(true); },
      async () => { if (await source.isTodo()) await clone.setIsTodo(true); },
      async () => { if (await source.isFolder()) await clone.setIsFolder(true); },
    ]) {
      try {
        await copier();
      } catch {
        // Formatting/state is best-effort; the core content clone must continue.
      }
    }

    try {
      const fontSize = await source.getFontSize();
      if (fontSize) await clone.setFontSize(fontSize);
    } catch {
      // Best-effort.
    }
    try {
      const highlight = await source.getHighlightColor();
      if (highlight) await clone.setHighlightColor(highlight as any);
    } catch {
      // Best-effort.
    }
    try {
      const todoStatus = await source.getTodoStatus();
      if (todoStatus) await clone.setTodoStatus(todoStatus);
    } catch {
      // Best-effort.
    }

    await clone.setParent(parent, positionAmongstSiblings);

    const children = await source.getChildrenRem();
    for (const child of children || []) {
      await this.cloneRemSubtree(child, clone);
    }

    return clone;
  }

  /**
   * Convert plain text to RichTextInterface
   */
  private textToPlainRichText(text: string): RichTextInterface {
    return [text];
  }

  private async textToRichTextWithInlineMarkers(text: string): Promise<RichTextInterface | undefined> {
    const markerRe = /\[\[(Red|Orange|Yellow|Green|Blue|Purple|Gray|Brown|Pink):([\s\S]*?)\]\]/g;
    const colorCodes: Record<string, number> = {
      Red: 1,
      Orange: 2,
      Yellow: 3,
      Green: 4,
      Blue: 6,
      Purple: 5,
      Gray: 7,
      Brown: 8,
      Pink: 9
    };
    const richText: RichTextInterface = [];
    let cursor = 0;
    let match: RegExpExecArray | null;
    let found = false;

    while ((match = markerRe.exec(text)) !== null) {
      const full = match[0];
      const colorName = match[1];
      const body = match[2] || '';
      const before = text.slice(cursor, match.index);
      if (before) richText.push(before);
      if (body) {
        richText.push({
          i: 'm',
          text: body,
          b: true,
          tc: colorCodes[colorName]
        } as any);
      }
      cursor = match.index + full.length;
      found = true;
    }

    if (!found) return undefined;
    const after = text.slice(cursor);
    if (after) richText.push(after);
    return richText;
  }

  /**
   * Convert user input text to RichTextInterface with markdown support.
   * Falls back to plain text if markdown parsing is unavailable/fails.
   */
  private async textToRichText(text: string): Promise<RichTextInterface> {
    const inlineMarked = await this.textToRichTextWithInlineMarkers(text);
    if (inlineMarked) {
      return inlineMarked;
    }

    const boldItalicMatch = text.match(/^\*\*\*(.+)\*\*\*$/s);
    if (boldItalicMatch && boldItalicMatch[1]) {
      try {
        const plain = this.textToPlainRichText(boldItalicMatch[1]);
        const len = boldItalicMatch[1].length;
        const bold = await this.plugin.richText.applyTextFormatToRange(plain, 0, len, 'bold');
        return await this.plugin.richText.applyTextFormatToRange(bold, 0, len, 'italic');
      } catch (e) {
        console.warn('bold+italic format conversion failed, trying markdown parser', e);
      }
    }

    const boldMatch = text.match(/^\*\*(.+)\*\*$/s);
    if (boldMatch && boldMatch[1]) {
      try {
        const plain = this.textToPlainRichText(boldMatch[1]);
        return await this.plugin.richText.applyTextFormatToRange(plain, 0, boldMatch[1].length, 'bold');
      } catch (e) {
        console.warn('bold format conversion failed, trying markdown parser', e);
      }
    }

    const italicMatch = text.match(/^\*(.+)\*$/s);
    if (italicMatch && italicMatch[1]) {
      try {
        const plain = this.textToPlainRichText(italicMatch[1]);
        return await this.plugin.richText.applyTextFormatToRange(plain, 0, italicMatch[1].length, 'italic');
      } catch (e) {
        console.warn('italic format conversion failed, trying markdown parser', e);
      }
    }

    const boldPrefixMatch = text.match(/^\*\*([^*]+)\*\*(\s+.+)$/s);
    if (boldPrefixMatch && boldPrefixMatch[1] && boldPrefixMatch[2]) {
      try {
        const visible = `${boldPrefixMatch[1]}${boldPrefixMatch[2]}`;
        const plain = this.textToPlainRichText(visible);
        return await this.plugin.richText.applyTextFormatToRange(plain, 0, boldPrefixMatch[1].length, 'bold');
      } catch (e) {
        console.warn('bold prefix format conversion failed, trying markdown parser', e);
      }
    }

    try {
      if (this.plugin?.richText?.parseFromMarkdown) {
        return await this.plugin.richText.parseFromMarkdown(text);
      }
    } catch (e) {
      console.warn('parseFromMarkdown failed, falling back to plain text', e);
    }
    return this.textToPlainRichText(text);
  }

  private normalizeImageUrls(imageUrls?: string[]): string[] {
    if (!Array.isArray(imageUrls)) return [];
    return imageUrls
      .map((url) => (typeof url === 'string' ? url.trim() : ''))
      .filter((url) => /^https?:\/\//i.test(url) || /^data:image\/[a-z0-9.+-]+;base64,/i.test(url));
  }

  private async appendImageRems(parent: PluginRem, imageUrls?: string[]): Promise<void> {
    const normalizedUrls = this.normalizeImageUrls(imageUrls);
    if (normalizedUrls.length === 0) return;

    type MarkdownRemApi = typeof this.plugin.rem & {
      createSingleRemWithMarkdown?: (markdown: string) => Promise<PluginRem | undefined>;
    };

    const markdownRemApi = this.plugin.rem as MarkdownRemApi;

    for (const imageUrl of normalizedUrls) {
      const markdown = `![Source image](${imageUrl})`;

      if (typeof markdownRemApi.createSingleRemWithMarkdown === 'function') {
        const markdownRem = await markdownRemApi.createSingleRemWithMarkdown(markdown);
        if (markdownRem) {
          await markdownRem.setParent(parent);
          continue;
        }
      }

      const imageRem = await this.plugin.rem.createRem();
      if (!imageRem) continue;
      await imageRem.setText(await this.textToRichText(markdown));
      await imageRem.setParent(parent);
    }
  }

  private async createChildRem(parent: PluginRem, text: string, positionAmongstSiblings?: number): Promise<PluginRem | undefined> {
    const child = await this.plugin.rem.createRem();
    if (!child) return undefined;
    await child.setText(await this.textToRichText(text));
    await child.setParent(parent, positionAmongstSiblings);
    return child;
  }

  private async getBlankDirectChildIds(rem: PluginRem): Promise<Set<string>> {
    const blankIds = new Set<string>();
    const children = await rem.getChildrenRem();
    if (!children || children.length === 0) return blankIds;

    for (const child of children) {
      const text = (await this.getRemText(child)).trim();
      const grandchildren = await child.getChildrenRem();
      if (!text && (!grandchildren || grandchildren.length === 0)) {
        blankIds.add(child._id);
      }
    }

    return blankIds;
  }

  private async isStructuralRem(rem: any): Promise<boolean> {
    for (const method of ['isPowerupPropertyListItem', 'isPowerupSlot', 'isPowerupProperty', 'isSlot', 'isProperty']) {
      if (typeof rem?.[method] === 'function') {
        try {
          if (await rem[method]()) return true;
        } catch {
          // Ignore SDK states that do not support a structural check.
        }
      }
    }
    return false;
  }

  private async removeNewBlankDirectChildren(rem: PluginRem, before: Set<string>): Promise<number> {
    const children = await rem.getChildrenRem();
    if (!children || children.length === 0) return 0;

    let removed = 0;
    for (const child of children) {
      if (before.has(child._id)) continue;
      if (await this.isStructuralRem(child)) continue;
      const text = (await this.getRemText(child)).trim();
      const grandchildren = await child.getChildrenRem();
      if (!text && (!grandchildren || grandchildren.length === 0)) {
        await child.remove();
        removed++;
      }
    }

    return removed;
  }

  private headingFontSizeFromLevel(headingLevel?: number): 'H1' | 'H2' | 'H3' | undefined {
    if (typeof headingLevel !== 'number' || headingLevel <= 0) return undefined;
    return headingLevel === 1 ? 'H1' : headingLevel === 2 ? 'H2' : 'H3';
  }

  private async setRawPowerupProperty(rem: any, powerupCode: string, powerupSlot: string, value: unknown[]): Promise<void> {
    if (typeof rem.call !== 'function') return;
    await rem.call('setPowerupProperty', { powerupCode, powerupSlot, value });
  }

  private async setPowerupProperty(rem: any, powerupCode: string, powerupSlot: string, value: unknown[]): Promise<void> {
    if (typeof rem.setPowerupProperty === 'function') {
      await rem.setPowerupProperty(powerupCode, powerupSlot, value);
    }
  }

  private async resolveHeaderSizeOptionRemId(fontSize: 'H1' | 'H2' | 'H3'): Promise<string | undefined> {
    try {
      const sizeSlot = await this.plugin.powerup.getPowerupSlotByCode('r', 'Size');
      if (!sizeSlot) return undefined;
      const options = await sizeSlot.getChildrenRem();
      for (const option of options || []) {
        if ((await this.getRemText(option)).trim() === fontSize) {
          return option._id;
        }
      }
    } catch (e) {
      console.warn('Could not resolve Header Size option rem', e);
    }
    return undefined;
  }

  private async applyHeadingLevel(rem: PluginRem, headingLevel?: number): Promise<void> {
    if (typeof headingLevel !== 'number') return;

    if (headingLevel <= 0) {
      await rem.setFontSize(undefined);
      try {
        await rem.removePowerup('r');
      } catch {
        // Some RemNote states already have no header power-up.
      }
      return;
    }

    const fontSize = this.headingFontSizeFromLevel(headingLevel);
    if (!fontSize) return;

    await rem.setFontSize(fontSize);

    // RemNote's visual heading level is backed by Header power-up slot "s" (SDK alias: Size).
    // setFontSize can leave the power-up present without the size slot, so lock both.
    try {
      await rem.addPowerup('r');
    } catch {
      // Already present in normal heading updates.
    }
    const headerSizeOptionId = await this.resolveHeaderSizeOptionRemId(fontSize);
    const headerSizeValue = headerSizeOptionId
      ? ([{ i: 'q', _id: headerSizeOptionId }] as any[])
      : [fontSize];
    await this.setPowerupProperty(rem, 'r', 'Size', headerSizeValue);
    await this.setRawPowerupProperty(rem, 'r', 's', headerSizeValue);
  }

  private async createFlashcardDetailToggle(
    parent: PluginRem,
    section: FlashcardDetailSection,
    positionAmongstSiblings?: number
  ): Promise<void> {
    const title = (section?.title || '').trim();
    if (!title) return;

    const headerRem = await this.createChildRem(parent, title, positionAmongstSiblings);
    if (!headerRem) return;

    let childPosition = 0;
    const body = (section.body || '').trim();
    if (body) {
      await this.createChildRem(headerRem, body, childPosition++);
    }

    for (const childSection of (section.children || [])) {
      await this.createFlashcardDetailToggle(headerRem, childSection, childPosition++);
    }

    if (section.collapsed !== false) {
      try {
        await headerRem.collapse(undefined);
      } catch (e) {
        console.warn('Could not collapse flashcard detail toggle', e);
      }
    }
  }

  /**
   * Add a tag to a Rem (helper function)
   */
  private async addTagToRem(rem: PluginRem, tagName: string): Promise<void> {
    const tagRem = await this.plugin.rem.findByName([tagName], null);
    if (tagRem) {
      await rem.addTag(tagRem._id);
    } else {
      const newTag = await this.plugin.rem.createRem();
      if (newTag) {
        await newTag.setText(this.textToPlainRichText(tagName));
        await rem.addTag(newTag._id);
      }
    }
  }

  // Helper to check if string is UUID
  private isUUID(str: string): boolean {
    return !str.includes(' ') && str.length > 15;
  }

  /**
   * Build locale-aware variants for robust matching in Turkish.
   */
  private buildNameVariants(value: string): string[] {
    const base = (value || '').normalize('NFC').trim();
    if (!base) return [];
    const folded = base
      .replace(/[Ã§Ã‡]/g, 'c')
      .replace(/[gG]/g, 'g')
      .replace(/[iI]/g, 'i')
      .replace(/[Ã¶Ã–]/g, 'o')
      .replace(/[sS]/g, 's')
      .replace(/[Ã¼Ãœ]/g, 'u');
    return Array.from(new Set([
      base,
      folded,
      folded.toUpperCase(),
      folded.toLowerCase(),
      base.toLocaleUpperCase('tr-TR'),
      base.toLocaleLowerCase('tr-TR'),
      base.toUpperCase(),
      base.toLowerCase(),
    ]));
  }

  /**
   * Lightweight TR -> EN concept expansion for search-only paths.
   * Keeps plugin-side search cheap while improving cross-language note recall.
   */
  private buildSearchQueryVariants(value: string): string[] {
    const normalized = this.normalizeForCompare(value);
    if (!normalized) return [];

    const aliasMap: Record<string, string> = {
      bilinc: 'consciousness',
      bilinci: 'consciousness',
      hafiza: 'memory',
      hafizasi: 'memory',
      zeka: 'intelligence',
      dikkat: 'attention',
      algi: 'perception',
      diyagram: 'diagram',
      diyagrami: 'diagram',
      sistem: 'system',
      sistemi: 'system',
      sistemleri: 'systems',
      ajan: 'agent',
      ajanlar: 'agents',
      ogrenme: 'learning',
      cagirma: 'retrieval'
    };

    let expanded = ` ${normalized} `;
    for (const [source, target] of Object.entries(aliasMap)) {
      expanded = expanded.replace(new RegExp(`\\b${source}\\b`, 'g'), target);
    }

    return Array.from(new Set([
      value.trim(),
      normalized,
      expanded.replace(/\s+/g, ' ').trim()
    ].filter(Boolean)));
  }

  /**
   * Normalize text for robust internal comparisons.
   */
  private normalizeForCompare(value: string): string {
    return (value || '')
      .normalize('NFC')
      .toLocaleLowerCase('tr-TR')
      .replace(/[Ã§Ã‡]/g, 'c')
      .replace(/[gG]/g, 'g')
      .replace(/[iI]/g, 'i')
      .replace(/[Ã¶Ã–]/g, 'o')
      .replace(/[sS]/g, 's')
      .replace(/[Ã¼Ãœ]/g, 'u')
      .trim();
  }

  private buildSearchIntent(query: string): { wantsDiagram: boolean; wantsWorkflow: boolean } {
    const normalized = ` ${this.normalizeForCompare(query)} `;
    return {
      wantsDiagram: /\s(diyagram|diagram|schema|sema|map|visual)\s/.test(normalized),
      wantsWorkflow: /\s(workflow|pipeline|process|surec|akis|system|sistem)\s/.test(normalized),
    };
  }

  private looksLikeUrlTitle(title: string): boolean {
    const normalized = (title || '').trim().toLowerCase();
    return normalized.startsWith('url:') || normalized.startsWith('http://') || normalized.startsWith('https://') || normalized.startsWith('www.');
  }

  private async ensureSemanticReady(): Promise<void> {
    if (this.semanticInitStarted) return;
    this.semanticInitStarted = true;

    await semanticEngine.init();
    if (await semanticEngine.needsReindex()) {
      setTimeout(() => {
        void this.triggerSemanticIndex();
      }, 3000);
    }
  }

  private applySearchQualityPenalty(title: string, preview: string, searchMode: SearchParams['searchMode'] = 'normal'): number {
    const normalizedTitle = this.normalizeForCompare(title);
    const normalizedPreview = this.normalizeForCompare(preview);
    let penalty = 0;
    const resultType = this.classifySearchResultType(title, preview);

    // Toplu liste / soru / meta notlari aramada alta it.
    if (normalizedTitle.startsWith('-')) penalty += 18;
    if (normalizedTitle.includes('\n-')) penalty += 16;
    if (normalizedTitle.includes('what is the most important idea')) penalty += 28;
    if (normalizedTitle.includes('how does this connect')) penalty += 18;
    if (this.looksLikeUrlTitle(title)) penalty += 34;
    if (title.length > 140) penalty += 42;
    else if (title.length > 90) penalty += 24;
    if ((title.match(/\s+/g) || []).length >= 10) penalty += 16;
    if (/[.!?]/.test(title) && title.length > 80) penalty += 18;
    if (normalizedPreview.includes('exact match')) penalty -= 4;

    switch (resultType) {
      case 'index':
        penalty += 36;
        break;
      case 'question_bank':
        penalty += 28;
        break;
      case 'raw_capture':
        penalty += 18;
        break;
      case 'reflection':
        penalty += 12;
        break;
      case 'longform':
        penalty += 16;
        break;
      case 'note':
      default:
        penalty -= 8;
        break;
    }

    if (searchMode === 'deep') {
      return Math.round(penalty * 0.45);
    }

    return penalty;
  }

  private classifySearchResultType(title: string, preview: string): SearchResultItem['resultType'] {
    const normalizedTitle = this.normalizeForCompare(title);
    const normalizedPreview = this.normalizeForCompare(preview);

    if (
      normalizedTitle.startsWith('-') ||
      normalizedTitle.includes('->') ||
      normalizedTitle.includes('confidence=') ||
      normalizedTitle.includes('duplicates=')
    ) {
      return 'index';
    }

    if (
      normalizedTitle.includes('what is the most important idea') ||
      normalizedTitle.includes('how does this connect') ||
      normalizedPreview.includes('what is the most important idea')
    ) {
      return 'question_bank';
    }

    if (
      this.looksLikeUrlTitle(title) ||
      normalizedTitle.startsWith('clipboard_') ||
      normalizedTitle.startsWith('desktop_capture_') ||
      normalizedTitle.startsWith('ocr-') ||
      normalizedTitle.startsWith('chat_attachment_') ||
      normalizedTitle.startsWith('media__')
    ) {
      return 'raw_capture';
    }

    if (
      normalizedTitle.includes('task reflection') ||
      normalizedTitle.includes('ps6 conversation note')
    ) {
      return 'reflection';
    }

    if (title.length > 140 || ((title.match(/\s+/g) || []).length >= 12)) {
      return 'longform';
    }

    return 'note';
  }

  private extractCanonicalSearchTitle(title: string): string {
    const lines = (title || '')
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);

    const firstLine = (lines[0] || title || '').trim();
    const bulletStripped = firstLine.replace(/^\s*[-*â€¢]+\s*/, '');
    const arrowStripped = bulletStripped.split('->')[0].trim();
    const metadataStripped = arrowStripped
      .replace(/\s*\[[^\]]+\]\s*$/g, '')
      .replace(/\s+confidence=\S+/g, '')
      .replace(/\s+duplicates=\d+/g, '')
      .trim();

    return this.normalizeForCompare(metadataStripped);
  }

  private getRepresentativeQuality(item: SearchResultItem): number {
    let score = 0;
    switch (item.resultType) {
      case 'note':
        score += 60;
        break;
      case 'longform':
        score += 18;
        break;
      case 'reflection':
        score += 6;
        break;
      case 'raw_capture':
        score -= 16;
        break;
      case 'question_bank':
        score -= 24;
        break;
      case 'index':
        score -= 36;
        break;
      default:
        break;
    }

    if (this.looksLikeUrlTitle(item.title)) score -= 24;
    if (item.title.trim().startsWith('-')) score -= 18;
    if (item.title.length > 120) score -= 14;
    if (item.title.length >= 8 && item.title.length <= 80) score += 8;
    score += Math.round((item.semanticScore ?? 0) * 10);
    return score;
  }

  private dedupeRankedResults(items: Array<{ item: SearchResultItem; score: number }>, limit: number): SearchResultItem[] {
    const deduped = new Map<string, SearchResultItem>();

    for (const entry of items) {
      const key = this.extractCanonicalSearchTitle(entry.item.title) || this.normalizeForCompare(entry.item.preview) || entry.item.remId;
      const existing = deduped.get(key);
      if (!existing) {
        deduped.set(key, {
          ...entry.item,
          duplicateCount: 1
        });
        continue;
      }

      existing.duplicateCount = (existing.duplicateCount || 1) + 1;
      if ((existing.semanticScore || 0) < (entry.item.semanticScore || 0)) {
        existing.semanticScore = entry.item.semanticScore;
      }
      if (existing.matchSource !== entry.item.matchSource) {
        existing.matchSource = 'hybrid';
      }
      if (this.getRepresentativeQuality(entry.item) > this.getRepresentativeQuality(existing)) {
        const duplicateCount = existing.duplicateCount;
        deduped.set(key, {
          ...existing,
          ...entry.item,
          duplicateCount,
          semanticScore: Math.max(existing.semanticScore ?? 0, entry.item.semanticScore ?? 0),
          matchSource: existing.matchSource !== entry.item.matchSource ? 'hybrid' : entry.item.matchSource
        });
      }
    }

    return Array.from(deduped.values()).slice(0, limit);
  }

  private async applySemanticRerank(
    items: Array<{ item: SearchResultItem; score: number }>,
    query: string,
    semanticQueries: string[],
    searchMode: SearchParams['searchMode'] = 'normal'
  ): Promise<Array<{ item: SearchResultItem; score: number }>> {
    if (items.length === 0 || semanticQueries.length === 0) return items;

    const rerankWindow = searchMode === 'deep' ? 30 : 18;
    const selected = items.slice(0, rerankWindow);
    const intent = this.buildSearchIntent(query);

    for (const entry of selected) {
      let preview = entry.item.preview || '';

      if (
        preview.length < 80 ||
        preview === entry.item.title ||
        preview === 'Exact Match'
      ) {
        const rem = await this.plugin.rem.findOne(entry.item.remId);
        if (rem) {
          preview = await this.collectSearchPreview(rem, 4);
          if (preview) {
            entry.item.preview = preview;
          }
        }
      }

      let bestScore = entry.item.semanticScore ?? 0;
      for (const semanticQuery of semanticQueries) {
        bestScore = Math.max(
          bestScore,
          semanticEngine.scoreText(
            semanticQuery,
            entry.item.title,
            preview || entry.item.title,
            entry.item.resultType ?? 'note'
          )
        );
      }

      if (bestScore <= 0) continue;

      entry.item.semanticScore = Math.max(entry.item.semanticScore ?? 0, bestScore);
      if (entry.item.matchSource === 'fuzzy' || entry.item.matchSource === 'exact') {
        entry.item.matchSource = 'hybrid';
      }

      let rerankBoost = bestScore * (searchMode === 'deep' ? 135 : 170);
      const normalizedTitle = this.normalizeForCompare(entry.item.title);
      const normalizedPreview = this.normalizeForCompare(preview || entry.item.preview);
      const titleWordCount = normalizedTitle ? normalizedTitle.split(/\s+/).filter(Boolean).length : 0;
      const hasDiagramSignal = /\b(diyagram|diagram|schema|sema|map|visual)\b/.test(normalizedTitle) || /\b(diyagram|diagram|schema|sema|map|visual)\b/.test(normalizedPreview);

      if (entry.item.resultType === 'note' && bestScore >= 0.3) {
        rerankBoost += 16;
      }
      if (intent.wantsDiagram) {
        if (hasDiagramSignal) rerankBoost += 26;
        else rerankBoost -= entry.item.resultType === 'note' ? 28 : 46;

        if (entry.item.resultType === 'index') {
          rerankBoost -= 24;
        }

        if (entry.item.resultType === 'note' && titleWordCount <= 3 && !hasDiagramSignal) {
          rerankBoost -= 18;
        }
      }
      if (intent.wantsWorkflow) {
        const hasWorkflowSignal = /\b(workflow|pipeline|process|surec|akis|system|sistem)\b/.test(normalizedTitle) || /\b(workflow|pipeline|process|surec|akis|system|sistem)\b/.test(normalizedPreview);
        if (hasWorkflowSignal) rerankBoost += 14;
      }
      if (this.looksLikeUrlTitle(entry.item.title)) {
        rerankBoost -= 40;
      }
      entry.score += rerankBoost;
    }

    return items.sort((a, b) => b.score - a.score);
  }

  private applyIntentAwareBoost(
    items: Array<{ item: SearchResultItem; score: number }>,
    query: string,
    searchMode: SearchParams['searchMode'] = 'normal'
  ): Array<{ item: SearchResultItem; score: number }> {
    const intent = this.buildSearchIntent(query);
    if (!intent.wantsDiagram && !intent.wantsWorkflow) return items;

    for (const entry of items) {
      const normalizedTitle = this.normalizeForCompare(entry.item.title);
      const normalizedPreview = this.normalizeForCompare(entry.item.preview);
      const titleWordCount = normalizedTitle ? normalizedTitle.split(/\s+/).filter(Boolean).length : 0;

      let boost = 0;

      if (intent.wantsDiagram) {
        const hasDiagramInTitle = /\b(diyagram|diagram|schema|sema|map|visual)\b/.test(normalizedTitle);
        const hasDiagramInPreview = /\b(diyagram|diagram|schema|sema|map|visual)\b/.test(normalizedPreview);
        if (hasDiagramInTitle) boost += entry.item.resultType === 'note' ? 144 : 74;
        else if (hasDiagramInPreview) boost += entry.item.resultType === 'note' ? 62 : 28;
        else boost -= entry.item.resultType === 'note' ? 138 : 182;

        if (entry.item.resultType === 'index') boost -= 82;
        if (entry.item.resultType === 'note' && titleWordCount <= 3 && !hasDiagramInTitle && !hasDiagramInPreview) {
          boost -= 58;
        }
      }

      if (intent.wantsWorkflow) {
        const hasWorkflowSignal = /\b(workflow|pipeline|process|surec|akis|system|sistem)\b/.test(normalizedTitle) || /\b(workflow|pipeline|process|surec|akis|system|sistem)\b/.test(normalizedPreview);
        if (hasWorkflowSignal) boost += 20;
      }

      if (this.looksLikeUrlTitle(entry.item.title)) {
        boost -= 54;
      }

      if (searchMode === 'deep') {
        boost = Math.round(boost * 0.9);
      }

      entry.score += boost;
    }

    return items.sort((a, b) => b.score - a.score);
  }

  private async getAncestorIds(rem: PluginRem | undefined, maxDepth = 5): Promise<Set<string>> {
    const ids = new Set<string>();
    let current = rem;
    let depth = 0;

    while (current && depth < maxDepth) {
      ids.add(current._id);
      current = await current.getParentRem();
      depth += 1;
    }

    return ids;
  }

  private async applyContextAwareBoost(
    items: Array<{ item: SearchResultItem; score: number }>,
    searchContextRemId?: string,
    searchMode: SearchParams['searchMode'] = 'normal'
  ): Promise<Array<{ item: SearchResultItem; score: number }>> {
    if (!searchContextRemId) return items;

    const contextRem = await this.plugin.rem.findOne(searchContextRemId);
    if (!contextRem) return items;

    const contextTitle = this.normalizeForCompare(await this.getRemText(contextRem));
    const contextAncestors = await this.getAncestorIds(contextRem, 6);

    for (const entry of items) {
      const rem = await this.plugin.rem.findOne(entry.item.remId);
      if (!rem) continue;

      const itemAncestors = await this.getAncestorIds(rem, 6);
      let boost = 0;

      if (entry.item.remId === searchContextRemId) {
        boost += 140;
      } else if (itemAncestors.has(searchContextRemId)) {
        boost += 90;
      } else {
        const sharedAncestors = Array.from(itemAncestors).filter((id) => contextAncestors.has(id)).length;
        if (sharedAncestors >= 2) boost += 45;
        else if (sharedAncestors >= 1) boost += 20;
      }

      const normalizedTitle = this.normalizeForCompare(entry.item.title);
      const normalizedPreview = this.normalizeForCompare(entry.item.preview);
      if (contextTitle && (normalizedTitle.includes(contextTitle) || normalizedPreview.includes(contextTitle))) {
        boost += 18;
      }

      if (searchMode === 'deep') {
        boost = Math.round(boost * 1.15);
      }

      entry.score += boost;
    }

    return items.sort((a, b) => b.score - a.score);
  }

  private boostRankedSearchResult(
    ranked: Map<string, { item: SearchResultItem; score: number }>,
    item: SearchResultItem,
    boost: number,
    searchMode: SearchParams['searchMode'] = 'normal'
  ): void {
    const qualityPenalty = this.applySearchQualityPenalty(item.title, item.preview, searchMode);
    const adjustedBoost = Math.max(0, boost - qualityPenalty);
    item.resultType = this.classifySearchResultType(item.title, item.preview);
    const existing = ranked.get(item.remId);

    if (existing) {
      existing.score += adjustedBoost;
      existing.item.preview = existing.item.preview || item.preview;
      existing.item.content = existing.item.content || item.content;
      existing.item.semanticScore = Math.max(existing.item.semanticScore ?? 0, item.semanticScore ?? 0);
      existing.item.matchSource = existing.item.matchSource === item.matchSource ? existing.item.matchSource : 'hybrid';
      return;
    }

    ranked.set(item.remId, {
      item,
      score: adjustedBoost,
    });
  }

  private async collectSearchPreview(rem: PluginRem, maxChildren = 3): Promise<string> {
    const title = await this.getRemText(rem);
    const children = await rem.getChildrenRem();
    const childTexts = children
      ? await Promise.all(children.slice(0, maxChildren).map(async (child) => this.getRemText(child)))
      : [];
    return [title, ...childTexts.filter(Boolean)].join(' ').trim().slice(0, 420);
  }

  private async collectSemanticSeedRems(): Promise<Array<{ remId: string; title: string; preview: string }>> {
    const seedQueries = [
      'ai', 'agent', 'agents', 'memory', 'retrieval', 'recall', 'learning', 'workflow',
      'consciousness', 'attention', 'awareness', 'neuroscience', 'psychology',
      'python', 'developer tools', 'remnote', 'plugin', 'dashboard',
      'project', 'system', 'research', 'strategy', 'automation',
      'bilinc', 'hafiza', 'dikkat', 'ogrenme', 'zeka', 'diyagram',
      'teori', 'model', 'sistem', 'surec', 'akis', 'tanim', 'aciklama'
    ];
    const deduped = new Map<string, { remId: string; title: string; preview: string }>();

    for (const seed of seedQueries) {
      const results = await this.plugin.search.search(this.textToPlainRichText(seed), undefined, { numResults: 120 });
      for (const rem of results) {
        if (deduped.has(rem._id)) continue;
        const title = await this.getRemText(rem);
        if (!title) continue;

        const resultType = this.classifySearchResultType(title, title);
        if (resultType === 'question_bank') continue;

        const preview = await this.collectSearchPreview(rem, 5);
        deduped.set(rem._id, {
          remId: rem._id,
          title,
          preview
        });
      }
    }

    return Array.from(deduped.values());
  }

  /**
   * Resolve the row-tag rem backing a table rem.
   * RemNote stores this through the table query child configuration.
   */
  private async resolveTableRowTagRem(tableRem: PluginRem): Promise<PluginRem | undefined> {
    const children = await tableRem.getChildrenRem();

    for (const child of children) {
      const refs = await child.remsBeingReferenced();
      if (!refs || refs.length === 0) continue;

      let hasQueryRef = false;
      const candidates: PluginRem[] = [];

      for (const ref of refs) {
        const refTitle = this.normalizeForCompare(await this.getRemText(ref));
        if (refTitle === 'query') {
          hasQueryRef = true;
          continue;
        }
        if (refTitle === 'show nested descendants') continue;
        if (ref._id === tableRem._id) continue;
        candidates.push(ref);
      }

      if (hasQueryRef && candidates.length > 0) {
        return candidates[0];
      }
    }

    return undefined;
  }

  /**
   * Map incoming tag IDs so table rem IDs are converted to their row-tag IDs.
   * This prevents creating invisible rows by accidentally tagging with table rems.
   */
  private async resolveTagIdsForCreate(tagIds: string[] | undefined): Promise<string[]> {
    const resolved = new Set<string>();
    if (!tagIds || tagIds.length === 0) return [];

    for (const tagId of tagIds) {
      const clean = (tagId || '').trim();
      if (!clean) continue;

      const tagRem = await this.plugin.rem.findOne(clean);
      if (!tagRem) continue;

      let targetId = tagRem._id;
      try {
        if (await tagRem.isTable()) {
          const rowTagRem = await this.resolveTableRowTagRem(tagRem);
          if (rowTagRem) {
            targetId = rowTagRem._id;
          }
        }
      } catch {
        // Fall back to original tag id when table checks fail.
      }

      resolved.add(targetId);
    }

    return Array.from(resolved);
  }

  /**
   * Create a new note in RemNote
   */
  async createNote(params: CreateNoteParams): Promise<{ remId: string; title: string }> {
    const rem = await this.plugin.rem.createRem();
    if (!rem) {
      throw new Error('Failed to create Rem');
    }
    const blankChildrenBefore = new Set<string>();

    // Set the title
    await rem.setText(await this.textToRichText(params.title));

    // Apply formatting
    if (params.isDocument) await rem.setIsDocument(true);
    const headingFontSize = this.headingFontSizeFromLevel(params.headingLevel);
    await this.applyHeadingLevel(rem, params.headingLevel);
    if (params.isQuote) await rem.setIsQuote(true);
    if (params.isList) await rem.setIsListItem(true);

    // Add content as child if provided
    if (params.content) {
      const lines = params.content.split('\n');
      for (const line of lines) {
        if (line.trim()) {
          const contentRem = await this.plugin.rem.createRem();
          if (contentRem) {
            await contentRem.setText(await this.textToRichText(line));
            await contentRem.setParent(rem);
          }
        }
      }
    }

    // Set parent: use provided parentId, or default parent from settings, or root
    let parentId = params.parentId || this.settings.defaultParentId;
    let parentRem: PluginRem | undefined;

    // Auto-resolve parent with Turkish-aware variants
    if (parentId) {
      const targetName = parentId.trim();
      const variants = this.buildNameVariants(targetName);

      if (this.isUUID(targetName)) {
        try {
          const found = await this.plugin.rem.findOne(targetName);
          if (found) {
            parentRem = found;
            console.log(`[Adapter] Found parent by ID: ${targetName}`);
          }
        } catch {
          // Continue with name-based lookup
        }
      }

      if (!parentRem) {
        for (const variant of variants) {
          parentRem = await this.plugin.rem.findByName([variant], null);
          if (parentRem) {
            console.log(`[Adapter] Found parent by Exact Name: "${variant}"`);
            break;
          }
        }
      }

      if (!parentRem) {
        for (const variant of variants) {
          const validResults = await this.plugin.search.search(this.textToPlainRichText(variant), undefined, { numResults: 1 });
          if (validResults && validResults.length > 0) {
            parentRem = validResults[0];
            console.log(`[Adapter] Found parent via search: "${variant}" -> ${parentRem._id}`);
            break;
          }
        }
      }

      if (!parentRem) {
        console.log(`[Adapter] Parent "${targetName}" NOT FOUND. Creating it...`);
        parentRem = await this.plugin.rem.createRem();
        if (parentRem) {
          await parentRem.setText(this.textToPlainRichText(targetName));
          await parentRem.setIsDocument(true);
          await parentRem.setIsFolder(true);
          console.log(`[Adapter] Created new parent: ${parentRem._id}`);
        }
      }
    }

    if (parentRem) {
      await rem.setParent(parentRem);
    } else if (parentId) {
      console.warn(`[Adapter] Failed to resolve parent: ${parentId}`);
    }

    // Collect all tags to add
    const allTags = [...(params.tags || [])];

    // Add auto-tag if enabled
    if (this.settings.autoTagEnabled && this.settings.autoTag) {
      if (!allTags.includes(this.settings.autoTag)) {
        allTags.push(this.settings.autoTag);
      }
    }

    // Add all tags
    for (const tagName of allTags) {
      await this.addTagToRem(rem, tagName);
    }

    // Add tag IDs directly when provided (for deterministic table row tagging).
    if (params.tagIds && params.tagIds.length > 0) {
      const resolvedTagIds = await this.resolveTagIdsForCreate(params.tagIds);
      for (const tagId of resolvedTagIds) {
        const tagRem = await this.plugin.rem.findOne(tagId);
        if (tagRem) {
          await rem.addTag(tagRem._id);
        }
      }
    }

    // Some RemNote flows can clear heading on create/parent/tag operations.
    // Re-apply once at the end so create_note is deterministic in one call.
    if (headingFontSize) {
      await this.applyHeadingLevel(rem, params.headingLevel);
    }
    await this.removeNewBlankDirectChildren(rem, blankChildrenBefore);

    return { remId: rem._id, title: params.title };
  }

  private normalizeLinkRemUrl(rawUrl: string, allowUnsafeScheme = false): { url: string; protocol: string } {
    const url = String(rawUrl || '').trim();
    if (!url) {
      throw new Error('create_link_rem requires url.');
    }

    let parsed: URL;
    try {
      parsed = new URL(url);
    } catch {
      throw new Error(`Invalid URL for create_link_rem: ${url}`);
    }

    const protocol = parsed.protocol.toLocaleLowerCase('en-US');
    const safeProtocols = new Set(['http:', 'https:', 'mailto:', 'file:', 'remnote:', 'obsidian:', 'zotero:']);
    const blockedProtocols = new Set(['javascript:', 'data:', 'vbscript:']);
    if (blockedProtocols.has(protocol)) {
      throw new Error(`Blocked unsafe URL protocol for create_link_rem: ${protocol}`);
    }
    if (!allowUnsafeScheme && !safeProtocols.has(protocol)) {
      throw new Error(`Unsupported URL protocol for create_link_rem: ${protocol}. Pass allowUnsafeScheme=true for non-standard schemes.`);
    }

    return { url, protocol };
  }

  async createLinkRem(params: CreateLinkRemParams): Promise<unknown> {
    const normalized = this.normalizeLinkRemUrl(params.url, params.allowUnsafeScheme === true);
    const addTitle = params.addTitle === true;
    const positionAmongstSiblings = typeof params.positionAmongstSiblings === 'number'
      ? params.positionAmongstSiblings
      : undefined;
    const plannedCall = {
      namespace: 'rem',
      method: 'createLinkRem',
      args: [normalized.url, addTitle],
      parentId: params.parentId || null,
      positionAmongstSiblings,
    };
    const confirmationText = 'CREATE_LINK_REM';

    if (params.dryRun === true || params.confirm !== confirmationText) {
      return {
        success: false,
        requiresConfirmation: params.dryRun === true ? false : true,
        confirmationText,
        readOnly: params.dryRun === true,
        dryRun: params.dryRun === true,
        mutationApplied: false,
        mode: 'create_link_rem',
        pluginVersion: '2.58.0',
        url: normalized.url,
        protocol: normalized.protocol,
        reason: params.dryRun === true
          ? 'Dry run only; link Rem was not created.'
          : 'Confirmation text is required before creating a link Rem.',
        plannedCall,
      };
    }

    const linkRem = await this.plugin.rem.createLinkRem(normalized.url, addTitle);
    if (!linkRem) {
      throw new Error('Failed to create link Rem.');
    }

    let parent: PluginRem | undefined;
    if (params.parentId) {
      parent = await this.plugin.rem.findOne(params.parentId);
      if (!parent) {
        throw new Error(`Parent Rem not found for create_link_rem: ${params.parentId}`);
      }
      await linkRem.setParent(parent, positionAmongstSiblings);
    }

    const summary = params.includeSummary === false
      ? undefined
      : await this.getRemSummary(linkRem, { includeTypeFlags: true, includePowerups: true });

    return {
      success: true,
      readOnly: false,
      dryRun: false,
      mutationApplied: true,
      mode: 'create_link_rem',
      pluginVersion: '2.58.0',
      remId: linkRem._id,
      url: normalized.url,
      protocol: normalized.protocol,
      addTitle,
      parentId: params.parentId || null,
      plannedCall,
      ...(summary ? { summary } : {}),
    };
  }

  /**
   * Append content to today's journal/daily document
   */
  async appendJournal(params: AppendJournalParams): Promise<{ remId: string; content: string }> {
    const today = new Date();
    const dailyDoc = await this.plugin.date.getDailyDoc(today);

    if (!dailyDoc) {
      throw new Error('Failed to access daily document');
    }

    const entryRem = await this.plugin.rem.createRem();
    if (!entryRem) {
      throw new Error('Failed to create journal entry');
    }

    // Build the text with prefix and optional timestamp
    const useTimestamp = params.timestamp ?? this.settings.journalTimestamp;
    const prefix = this.settings.journalPrefix;

    let text = '';
    if (prefix) {
      text += `${prefix} `;
    }
    if (useTimestamp) {
      text += `[${today.toLocaleTimeString()}] `;
    }
    text += params.content;

    await entryRem.setText(await this.textToRichText(text));
    await entryRem.setParent(dailyDoc);

    return { remId: entryRem._id, content: text };
  }

  /**
   * Search the knowledge base
   */
  async search(params: SearchParams): Promise<{ results: SearchResultItem[] }> {
    const limit = params.limit ?? 20;
    const searchMode = params.searchMode ?? 'normal';
    const fuzzyCandidateLimit = searchMode === 'deep'
      ? Math.max(limit * 4, 60)
      : Math.max(limit * 3, 30);
    const results: SearchResultItem[] = [];
    const ranked = new Map<string, { item: SearchResultItem; score: number }>();
    const variants = Array.from(new Set(
      this.buildSearchQueryVariants(params.query).flatMap((queryVariant) => this.buildNameVariants(queryVariant))
    ));
    const semanticQueries = this.buildSearchQueryVariants(params.query);

    await this.ensureSemanticReady();

    try {
      for (let variantIndex = 0; variantIndex < variants.length; variantIndex += 1) {
        const variant = variants[variantIndex];
        const exactMatch = await this.plugin.rem.findByName([variant], null);
        if (!exactMatch) continue;
        const title = await this.getRemText(exactMatch);
        this.boostRankedSearchResult(ranked, {
          remId: exactMatch._id,
          title: title || variant,
          preview: 'Exact Match',
          matchSource: 'exact'
        }, 140 - (variantIndex * 10), searchMode);
      }
    } catch (e) {
      console.error('Exact match search failed', e);
    }

    try {
      for (let variantIndex = 0; variantIndex < variants.length; variantIndex += 1) {
        const variant = variants[variantIndex];
        const searchResults = await this.plugin.search.search(
          this.textToPlainRichText(variant),
          undefined,
          { numResults: fuzzyCandidateLimit }
        );

        for (let rank = 0; rank < searchResults.length; rank += 1) {
          const rem = searchResults[rank];
          const title = await this.getRemText(rem);
          const preview = title.substring(0, 100);
          const item: SearchResultItem = {
            remId: rem._id,
            title,
            preview,
            matchSource: 'fuzzy'
          };

          if (params.includeContent) {
            const children = await rem.getChildrenRem();
            if (children && children.length > 0) {
              const childTexts = await Promise.all(children.slice(0, 5).map(async (child) => {
                return await this.getRemText(child);
              }));
              item.content = childTexts.join('\n');
            }
          }

          const baseScore = variantIndex === 0 ? 64 : Math.max(20, 52 - (variantIndex * 8));
          const rankBonus = Math.max(0, limit - rank);
          this.boostRankedSearchResult(ranked, item, baseScore + rankBonus, searchMode);
        }
      }
    } catch (e) {
      console.error('Fuzzy search failed', e);
    }

    try {
      for (let queryIndex = 0; queryIndex < semanticQueries.length; queryIndex += 1) {
        const semanticQuery = semanticQueries[queryIndex];
        const semanticResults = await semanticEngine.search(semanticQuery, limit);
        for (const semanticResult of semanticResults) {
          const item: SearchResultItem = {
            remId: semanticResult.remId,
            title: semanticResult.title,
            preview: semanticResult.preview,
            semanticScore: semanticResult.semanticScore,
            matchSource: 'semantic'
          };
          const queryBonus = queryIndex === 0 ? 1 : 0.92;
          this.boostRankedSearchResult(ranked, item, (95 + (semanticResult.semanticScore * 120)) * queryBonus, searchMode);
        }
      }
    } catch (e) {
      console.error('Semantic search failed', e);
    }

    const preLimit = searchMode === 'deep' ? limit * 8 : limit * 4;
    const sorted = Array.from(ranked.values())
      .sort((a, b) => b.score - a.score)
      .slice(0, preLimit);

    const reranked = await this.applySemanticRerank(sorted, params.query, semanticQueries, searchMode);
    const contextSorted = await this.applyContextAwareBoost(reranked, params.searchContextRemId, searchMode);
    const intentSorted = this.applyIntentAwareBoost(contextSorted, params.query, searchMode);
    results.push(...this.dedupeRankedResults(intentSorted, limit));

    if (params.includeContent) {
      try {
        for (const item of results) {
          if (item.content) continue;
          const rem = await this.plugin.rem.findOne(item.remId);
          if (!rem) continue;
          const children = await rem.getChildrenRem();
          if (!children || children.length === 0) continue;
          const childTexts = await Promise.all(children.slice(0, 5).map(async (child) => this.getRemText(child)));
          item.content = childTexts.join('\n');
        }
      } catch (e) {
        console.error('Search content hydration failed', e);
      }
    }

    return { results };
  }

  async getSemanticStatus(): Promise<{ ok: boolean; enabled: boolean; message: string; count: number; indexing: boolean }> {
    await this.ensureSemanticReady();
    const status = semanticEngine.getStatus();
    return {
      ok: true,
      enabled: status.isReady || status.isIndexing,
      message: status.isReady
        ? `Semantic index hazir (${status.count} not).`
        : status.isIndexing
          ? 'Semantic index olusuyor...'
          : 'Semantic index henuz hazir degil.',
      count: status.count,
      indexing: status.isIndexing
    };
  }

  async triggerSemanticIndex(): Promise<void> {
    await this.ensureSemanticReady();
    await semanticEngine.buildIndexInBackground(async () => {
      return this.collectSemanticSeedRems();
    });
  }

  /**
   * Read a note by its ID
   */
  async readNote(params: ReadNoteParams): Promise<{
    remId: string;
    title: string;
    content: string;
    children: NoteChild[];
    parentId?: string;
    parentTitle?: string;
    fontSize?: 'H1' | 'H2' | 'H3';
    createdAt?: number;
    updatedAt?: number;
    localUpdatedAt?: number;
  }> {
    const depth = params.depth ?? 3;
    const rem = await this.plugin.rem.findOne(params.remId);

    if (!rem) {
      throw new Error(`Note not found: ${params.remId}`);
    }

    // Use helper
    const title = await this.getRemText(rem);
    const children = await this.getChildrenRecursive(rem, depth);
    const parentRem = await rem.getParentRem();
    const parentTitle = parentRem ? await this.getRemText(parentRem) : undefined;
    const fontSize = await rem.getFontSize();

    return {
      remId: rem._id,
      title,
      content: title,
      children,
      parentId: parentRem?._id,
      parentTitle,
      fontSize,
      createdAt: typeof rem.createdAt === 'number' ? rem.createdAt : undefined,
      updatedAt: typeof rem.updatedAt === 'number' ? rem.updatedAt : undefined,
      localUpdatedAt: typeof rem.localUpdatedAt === 'number' ? rem.localUpdatedAt : undefined
    };
  }

  /**
   * Recursively get children of a Rem
   */
  private async getChildrenRecursive(rem: PluginRem, depth: number): Promise<NoteChild[]> {
    if (depth <= 0) return [];

    const children = await rem.getChildrenRem();
    if (!children || children.length === 0) return [];

    const result: NoteChild[] = [];

    for (const child of children) {
      // Use helper
      const text = await this.getRemText(child);
      const grandchildren = await this.getChildrenRecursive(child, depth - 1);

      result.push({
        remId: child._id,
        text,
        children: grandchildren
      });
    }

    return result;
  }

  /**
   * Update an existing note
   */
  async updateNote(params: UpdateNoteParams): Promise<{ success: boolean; remId: string }> {
    const rem = await this.plugin.rem.findOne(params.remId);

    if (!rem) {
      throw new Error(`Note not found: ${params.remId}`);
    }
    const blankChildrenBefore = await this.getBlankDirectChildIds(rem);

    // RemNote may clear heading style when text is rewritten.
    // Preserve current heading unless caller explicitly overrides headingLevel.
    const previousFontSize = await rem.getFontSize();

    // Update title if provided
    if (params.title) {
      await rem.setText(await this.textToRichText(params.title));
    }

    if (typeof params.headingLevel === 'number') {
      await this.applyHeadingLevel(rem, params.headingLevel);
    } else if (params.title) {
      await rem.setFontSize(previousFontSize);
    }

    // Append content as new children
    if (params.appendContent) {
      const lines = params.appendContent.split('\n');
      for (const line of lines) {
        if (line.trim()) {
          const contentRem = await this.plugin.rem.createRem();
          if (contentRem) {
            await contentRem.setText(await this.textToRichText(line));
            await contentRem.setParent(rem);
          }
        }
      }
    }

    // Add tags
    if (params.addTags && params.addTags.length > 0) {
      for (const tagName of params.addTags) {
        await this.addTagToRem(rem, tagName);
      }
    }

    // Remove tags
    if (params.removeTags && params.removeTags.length > 0) {
      for (const tagName of params.removeTags) {
        const tagRem = await this.plugin.rem.findByName([tagName], null);
        if (tagRem) {
          await rem.removeTag(tagRem._id);
        }
      }
    }

    await this.removeNewBlankDirectChildren(rem, blankChildrenBefore);

    return { success: true, remId: params.remId };
  }

  /**
   * Move an existing note to another parent (or root when parentId is null/empty).
   */
  async moveNote(params: MoveNoteParams): Promise<{ success: boolean; remId: string; parentId: string | null }> {
    const rem = await this.plugin.rem.findOne(params.remId);
    if (!rem) {
      throw new Error(`Note not found: ${params.remId}`);
    }

    const target = (params.parentId || '').trim();
    if (!target) {
      await rem.setParent(null, params.positionAmongstSiblings);
      return { success: true, remId: rem._id, parentId: null };
    }

    let parentRem: PluginRem | undefined;
    if (this.isUUID(target)) {
      parentRem = await this.plugin.rem.findOne(target);
    }

    if (!parentRem) {
      const variants = this.buildNameVariants(target);
      for (const variant of variants) {
        parentRem = await this.plugin.rem.findByName([variant], null);
        if (parentRem) break;
      }
    }

    if (!parentRem) {
      const variants = this.buildNameVariants(target);
      for (const variant of variants) {
        const results = await this.plugin.search.search(this.textToPlainRichText(variant), undefined, { numResults: 1 });
        if (results && results.length > 0) {
          parentRem = results[0];
          break;
        }
      }
    }

    if (!parentRem) {
      throw new Error(`Parent not found: ${target}`);
    }

    await rem.setParent(parentRem, params.positionAmongstSiblings);
    return { success: true, remId: rem._id, parentId: parentRem._id };
  }

  /**
   * Delete an existing note and its descendants.
   */
  async deleteNote(params: DeleteNoteParams): Promise<{ success: boolean; remId: string }> {
    const rem = await this.plugin.rem.findOne(params.remId);
    if (!rem) {
      throw new Error(`Note not found: ${params.remId}`);
    }
    await rem.remove();
    return { success: true, remId: params.remId };
  }

  /**
   * Replace all direct children of a note with new content lines.
   */
  async overwriteNoteContent(params: OverwriteNoteContentParams): Promise<{ success: boolean; remId: string }> {
    const rem = await this.plugin.rem.findOne(params.remId);
    if (!rem) {
      throw new Error(`Note not found: ${params.remId}`);
    }

    const existingChildren = await rem.getChildrenRem();
    if (existingChildren && existingChildren.length > 0) {
      for (const child of existingChildren) {
        await child.remove();
      }
    }

    const lines = (params.content || '')
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean);

    const fontSize = this.headingFontSizeFromLevel(params.headingLevel);

    for (const line of lines) {
      const child = await this.plugin.rem.createRem();
      if (!child) continue;
      await child.setText(await this.textToRichText(line));
      if (fontSize) {
        await this.applyHeadingLevel(child, params.headingLevel);
      }
      await child.setParent(rem);
    }

    return { success: true, remId: params.remId };
  }

  /**
   * Create a full summary note in one operation:
   * title + heading + tags + section headers + section body rows.
   */
  async createStructuredSummary(params: CreateStructuredSummaryParams): Promise<{
    remId: string;
    title: string;
    fontSize?: 'H1' | 'H2' | 'H3';
  }> {
    const created = await this.createNote({
      title: params.title,
      parentId: params.parentId,
      headingLevel: params.headingLevel ?? 3,
      tags: params.tags ?? []
    });

    const root = await this.plugin.rem.findOne(created.remId);
    if (!root) {
      throw new Error(`Failed to resolve summary rem after create: ${created.remId}`);
    }

    // Ensure clean structure in case template/default children are inserted.
    const existingChildren = await root.getChildrenRem();
    for (const child of existingChildren) {
      await child.remove();
    }

    for (const section of params.sections || []) {
      const headingText = (section.heading || '').trim();
      const bodyText = (section.body || '').trim();
      const imageUrls = this.normalizeImageUrls(section.imageUrls);
      if (!headingText && !bodyText && imageUrls.length === 0) continue;

      const headerRem = await this.plugin.rem.createRem();
      if (!headerRem) continue;
      await headerRem.setText(await this.textToRichText(`***${headingText || 'Section'}***`));
      await headerRem.setFontSize(undefined);
      await headerRem.setParent(root);

      if (bodyText) {
        const bodyRem = await this.plugin.rem.createRem();
        if (bodyRem) {
          await bodyRem.setText(await this.textToRichText(bodyText));
          await bodyRem.setParent(headerRem);
        }
      }

      await this.appendImageRems(headerRem, imageUrls);
    }

    // Final heading lock so caller gets deterministic level in one call.
    if (typeof params.headingLevel === 'number' && params.headingLevel > 0) {
      await this.applyHeadingLevel(root, params.headingLevel);
    }

    return {
      remId: root._id,
      title: await this.getRemText(root),
      fontSize: await root.getFontSize()
    };
  }

  /**
   * Create a native RemNote table rem.
   */
  async createTable(params: CreateTableParams): Promise<{
    remId: string;
    title: string;
    isTable: boolean;
    rowTagRemId: string;
  }> {
    const title = (params.title || 'Tablo').trim() || 'Tablo';
    let existingTagRem: PluginRem | undefined;

    if (params.existingTagId && params.existingTagId.trim()) {
      const target = params.existingTagId.trim();
      if (this.isUUID(target)) {
        existingTagRem = await this.plugin.rem.findOne(target);
      }
      if (!existingTagRem) {
        const variants = this.buildNameVariants(target);
        for (const variant of variants) {
          existingTagRem = await this.plugin.rem.findByName([variant], null);
          if (existingTagRem) break;
        }
      }
    }

    if (!existingTagRem) {
      const tableTag = await this.plugin.rem.createRem();
      if (!tableTag) {
        throw new Error('Failed to create table tag rem');
      }
      await tableTag.setText(await this.textToRichText(`${title} Row`));
      existingTagRem = tableTag;
    }

    const table = await this.plugin.rem.createTable(existingTagRem);
    if (!table) {
      throw new Error('Failed to create table rem');
    }

    await table.setText(await this.textToRichText(title));

    const parentTarget = (params.parentId || this.settings.defaultParentId || '').trim();
    if (parentTarget) {
      let parentRem: PluginRem | undefined;
      const variants = this.buildNameVariants(parentTarget);

      if (this.isUUID(parentTarget)) {
        parentRem = await this.plugin.rem.findOne(parentTarget);
      }

      if (!parentRem) {
        for (const variant of variants) {
          parentRem = await this.plugin.rem.findByName([variant], null);
          if (parentRem) break;
        }
      }

      if (!parentRem) {
        for (const variant of variants) {
          const matches = await this.plugin.search.search(this.textToPlainRichText(variant), undefined, {
            numResults: 1
          });
          if (matches && matches.length > 0) {
            parentRem = matches[0];
            break;
          }
        }
      }

      if (parentRem) {
        await table.setParent(parentRem);
      }
    }

    const allTags = [...(params.tags || [])];
    if (this.settings.autoTagEnabled && this.settings.autoTag) {
      if (!allTags.includes(this.settings.autoTag)) {
        allTags.push(this.settings.autoTag);
      }
    }
    for (const tagName of allTags) {
      await this.addTagToRem(table, tagName);
    }

    return {
      remId: table._id,
      title: (await this.getRemText(table)) || title,
      isTable: Boolean(await table.isTable()),
      rowTagRemId: existingTagRem._id
    };
  }

  /**
   * Create a property under a tag rem (table row tag), or reuse if it already exists.
   */
  async createProperty(params: CreatePropertyParams): Promise<{
    remId: string;
    title: string;
    parentTagId: string;
    propertyType?: unknown;
    propertyTypeError?: string;
    options?: Array<{ remId: string; title: string }>;
  }> {
    const requestedParent = await this.plugin.rem.findOne(params.parentTagId);
    if (!requestedParent) {
      throw new Error(`Parent tag not found: ${params.parentTagId}`);
    }
    let parent = requestedParent;

    try {
      if (await requestedParent.isTable()) {
        const rowTagRem = await this.resolveTableRowTagRem(requestedParent);
        if (!rowTagRem) {
          throw new Error(`Could not resolve row tag rem for table: ${requestedParent._id}`);
        }
        parent = rowTagRem;
      }
    } catch (err) {
      if (err instanceof Error) {
        throw err;
      }
      throw new Error(`Failed to resolve property parent for ${params.parentTagId}`);
    }

    const name = (params.name || '').trim();
    if (!name) {
      throw new Error('Property name is required');
    }

    const wanted = name.normalize('NFC').toLocaleLowerCase('tr-TR');
    const existingChildren = await parent.getChildrenRem();
    for (const child of existingChildren) {
      const childTitle = (await this.getRemText(child)).normalize('NFC').toLocaleLowerCase('tr-TR');
      if (childTitle === wanted) {
        if (!(await child.isProperty())) {
          await child.setIsProperty(true);
        }
        const result: {
          remId: string;
          title: string;
          parentTagId: string;
          propertyType?: unknown;
          propertyTypeError?: string;
          options?: Array<{ remId: string; title: string }>;
        } = {
          remId: child._id,
          title: await this.getRemText(child),
          parentTagId: parent._id
        };

        if (params.propertyType) {
          const propertyTypeResult = await this.setPropertyType({
            propertyId: child._id,
            propertyType: params.propertyType,
          });
          result.propertyType = propertyTypeResult.currentType ?? propertyTypeResult.requestedType;
          if (!propertyTypeResult.success && propertyTypeResult.reason) {
            if (params.strictPropertyType) {
              throw new Error(propertyTypeResult.reason);
            }
            result.propertyTypeError = propertyTypeResult.reason;
          }
        }

        if (Array.isArray(params.options) && params.options.length > 0) {
          result.options = [];
          for (const option of params.options) {
            const clean = (option || '').trim();
            if (!clean) continue;
            let exists = false;
            for (const optionChild of await child.getChildrenRem()) {
              if ((await this.getRemText(optionChild)).trim() === clean) {
                exists = true;
                break;
              }
            }
            if (exists) continue;
            const optionRem = await this.createChildRem(child, clean);
            if (optionRem) {
              result.options.push({ remId: optionRem._id, title: await this.getRemText(optionRem) });
            }
          }
        }

        return result;
      }
    }

    const property = await this.plugin.rem.createRem();
    if (!property) {
      throw new Error('Failed to create property rem');
    }

    await property.setText(await this.textToRichText(name));
    await property.setIsProperty(true);
    await property.setParent(parent);

    const result: {
      remId: string;
      title: string;
      parentTagId: string;
      propertyType?: unknown;
      propertyTypeError?: string;
      options?: Array<{ remId: string; title: string }>;
    } = {
      remId: property._id,
      title: name,
      parentTagId: parent._id
    };

    if (params.propertyType) {
      try {
        const propertyTypeResult = await this.setPropertyType({
          propertyId: property._id,
          propertyType: params.propertyType,
        });
        result.propertyType = propertyTypeResult.currentType ?? propertyTypeResult.requestedType;
        if (!propertyTypeResult.success && propertyTypeResult.reason) {
          if (params.strictPropertyType) {
            throw new Error(propertyTypeResult.reason);
          }
          result.propertyTypeError = propertyTypeResult.reason;
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        if (params.strictPropertyType) {
          throw err;
        }
        result.propertyTypeError = message;
      }
    }

    if (Array.isArray(params.options) && params.options.length > 0) {
      result.options = [];
      for (const option of params.options) {
        const clean = (option || '').trim();
        if (!clean) continue;
        let existing: PluginRem | undefined;
        for (const child of await property.getChildrenRem()) {
          if ((await this.getRemText(child)).trim() === clean) {
            existing = child;
            break;
          }
        }
        if (existing) continue;
        const optionRem = await this.createChildRem(property, clean);
        if (optionRem) {
          result.options.push({ remId: optionRem._id, title: await this.getRemText(optionRem) });
        }
      }
    }

    return result;
  }

  async getPropertyInfo(params: GetPropertyInfoParams): Promise<{
    remId: string;
    title: string;
    isProperty: boolean;
    propertyType?: unknown;
    options: Array<{ remId: string; title: string }>;
  }> {
    const property = await this.plugin.rem.findOne(params.propertyId);
    if (!property) {
      throw new Error(`Property rem not found: ${params.propertyId}`);
    }

    let propertyType: unknown = undefined;
    try {
      propertyType = await property.getPropertyType();
    } catch {
      propertyType = undefined;
    }

    const children = await property.getChildrenRem();
    const options = [];
    for (const child of children || []) {
      options.push({ remId: child._id, title: await this.getRemText(child) });
    }

    return {
      remId: property._id,
      title: await this.getRemText(property),
      isProperty: await property.isProperty(),
      propertyType,
      options,
    };
  }

  async setPropertyType(params: SetPropertyTypeParams): Promise<{
    success: boolean;
    supported: boolean;
    propertyId: string;
    requestedType: PropertyType;
    previousType?: unknown;
    currentType?: unknown;
    reason?: string;
  }> {
    const property = await this.plugin.rem.findOne(params.propertyId);
    if (!property) {
      throw new Error(`Property rem not found: ${params.propertyId}`);
    }
    if (!(await property.isProperty())) {
      await property.setIsProperty(true);
    }

    const propertyType = this.normalizePropertyType(params.propertyType);
    let previousType: unknown = undefined;
    try {
      previousType = await property.getPropertyType();
    } catch {
      previousType = undefined;
    }

    if (previousType === propertyType) {
      return {
        success: true,
        supported: true,
        propertyId: property._id,
        requestedType: propertyType,
        previousType,
        currentType: previousType,
      };
    }

    let currentType: unknown = undefined;
    try {
      currentType = await property.getPropertyType();
    } catch {
      currentType = undefined;
    }

    return {
      success: false,
      supported: false,
      propertyId: property._id,
      requestedType: propertyType,
      previousType,
      currentType,
      reason: 'RemNote Plugin SDK 0.0.46 exposes getPropertyType(), but does not expose a supported setter for native tag property types.',
    };
  }

  async createTemplate(params: CreateTemplateParams): Promise<{
    remId: string;
    title: string;
    tagId: string;
    autoApply: boolean;
    childCount: number;
  }> {
    const tag = await this.plugin.rem.findOne(params.tagId);
    if (!tag) {
      throw new Error(`Tag rem not found: ${params.tagId}`);
    }

    const cleanTitle = (params.title || '').trim();
    if (!cleanTitle) {
      throw new Error('Template title is required');
    }

    const children = await tag.getChildrenRem();
    let template: PluginRem | undefined;
    for (const child of children) {
      if ((await this.getRemText(child)).trim() === cleanTitle) {
        template = child;
        break;
      }
    }
    if (!template) {
      template = await this.plugin.rem.createRem();
      if (!template) throw new Error('Failed to create template Rem');
      await template.setText(await this.textToRichText(cleanTitle));
      await template.setParent(tag);
    }

    if (params.content) {
      const existingChildren = await template.getChildrenRem();
      if (!existingChildren || existingChildren.length === 0) {
        for (const line of params.content.split('\n')) {
          if (line.trim()) {
            await this.createChildRem(template, line);
          }
        }
      }
    }

    if (params.autoApply !== false) {
      await template.addPowerup('m');
    }

    return {
      remId: template._id,
      title: cleanTitle,
      tagId: tag._id,
      autoApply: await template.hasPowerup('m'),
      childCount: (await template.getChildrenRem()).length,
    };
  }

  async setTemplateAutoApply(params: SetTemplateAutoApplyParams): Promise<{ success: boolean; remId: string; autoApply: boolean }> {
    const template = await this.plugin.rem.findOne(params.templateId);
    if (!template) {
      throw new Error(`Template rem not found: ${params.templateId}`);
    }

    if (params.autoApply === false) {
      await template.removePowerup('m');
    } else {
      await template.addPowerup('m');
    }

    return {
      success: true,
      remId: template._id,
      autoApply: await template.hasPowerup('m'),
    };
  }

  async listTagTemplates(params: ListTagTemplatesParams): Promise<{
    tagId: string;
    templates: Array<{ remId: string; title: string; autoApply: boolean; childCount: number; activePowerups: string[] }>;
  }> {
    const tag = await this.plugin.rem.findOne(params.tagId);
    if (!tag) {
      throw new Error(`Tag rem not found: ${params.tagId}`);
    }

    const templates = [];
    for (const child of await tag.getChildrenRem()) {
      if (await child.isProperty()) continue;
      const title = (await this.getRemText(child)).trim();
      if (!title) continue;
      const activePowerups = await this.getActivePowerupCodes(child);
      templates.push({
        remId: child._id,
        title,
        autoApply: activePowerups.includes('m'),
        childCount: (await child.getChildrenRem()).length,
        activePowerups,
      });
    }

    return { tagId: tag._id, templates };
  }

  async applyTemplateToRem(params: ApplyTemplateToRemParams): Promise<{
    success: boolean;
    remId: string;
    templateId: string;
    tagId?: string;
    addedChildren: Array<{ remId: string; title: string }>;
    skippedTitles: string[];
    propertyDefaultsSet: string[];
  }> {
    const target = await this.plugin.rem.findOne(params.remId);
    if (!target) throw new Error(`Target Rem not found: ${params.remId}`);
    const template = await this.plugin.rem.findOne(params.templateId);
    if (!template) throw new Error(`Template Rem not found: ${params.templateId}`);

    if (params.tagId) {
      const tag = await this.plugin.rem.findOne(params.tagId);
      if (!tag) throw new Error(`Tag Rem not found: ${params.tagId}`);
      await target.addTag(tag);
    }

    const existingTitles = new Set<string>();
    if (params.skipExistingChildTitles) {
      for (const child of await target.getChildrenRem()) {
        existingTitles.add((await this.getRemText(child)).trim());
      }
    }

    const addedChildren: Array<{ remId: string; title: string }> = [];
    const skippedTitles: string[] = [];
    for (const templateChild of await template.getChildrenRem()) {
      const title = (await this.getRemText(templateChild)).trim();
      if (params.skipExistingChildTitles && existingTitles.has(title)) {
        skippedTitles.push(title);
        continue;
      }
      const cloned = await this.cloneRemSubtree(templateChild, target);
      if (cloned) {
        addedChildren.push({ remId: cloned._id, title });
      }
    }

    const propertyDefaultsSet: string[] = [];
    if (params.propertyDefaults) {
      for (const [propertyId, value] of Object.entries(params.propertyDefaults)) {
        const property = await this.plugin.rem.findOne(propertyId);
        if (!property) continue;
        await target.setTagPropertyValue(property._id, value ? await this.textToRichText(value) : undefined);
        propertyDefaultsSet.push(property._id);
      }
    }

    return {
      success: true,
      remId: target._id,
      templateId: template._id,
      tagId: params.tagId,
      addedChildren,
      skippedTitles,
      propertyDefaultsSet,
    };
  }

  async applyTagAutoTemplate(params: ApplyTagAutoTemplateParams): Promise<unknown> {
    const tagTemplates = await this.listTagTemplates({ tagId: params.tagId });
    const wantedTitle = (params.templateTitle || '').trim().toLocaleLowerCase('tr-TR');
    const template = tagTemplates.templates.find((entry) => (
      wantedTitle
        ? entry.title.trim().toLocaleLowerCase('tr-TR') === wantedTitle
        : entry.autoApply
    )) || tagTemplates.templates[0];

    if (!template) {
      throw new Error(`No template found under tag: ${params.tagId}`);
    }

    return this.applyTemplateToRem({
      remId: params.remId,
      templateId: template.remId,
      tagId: params.tagId,
      skipExistingChildTitles: params.skipExistingChildTitles,
      propertyDefaults: params.propertyDefaults,
    });
  }

  async remSdkCall(params: RemSdkCallParams): Promise<{ remId: string; method: string; result: unknown }> {
    if (!SDK_REM_METHOD_ALLOWLIST.has(params.method)) {
      throw new Error(`SDK Rem method is not allowlisted: ${params.method}`);
    }
    const rem = await this.plugin.rem.findOne(params.remId);
    if (!rem) {
      throw new Error(`Rem not found: ${params.remId}`);
    }
    const fn = (rem as any)[params.method];
    if (typeof fn !== 'function') {
      throw new Error(`Rem method is unavailable: ${params.method}`);
    }

    const result = await fn.apply(rem, Array.isArray(params.args) ? params.args : []);
    return {
      remId: rem._id,
      method: params.method,
      result: await this.serializeForBridge(result),
    };
  }

  async remRawCall(params: RemRawCallParams): Promise<{ remId: string; method: string; result: unknown }> {
    const rem = await this.plugin.rem.findOne(params.remId);
    if (!rem) {
      throw new Error(`Rem not found: ${params.remId}`);
    }

    const result = await this.callRawRemMethod(rem as any, params.method, params.payload || {});
    return {
      remId: rem._id,
      method: params.method,
      result: await this.serializeForBridge(result),
    };
  }

  async sdkNamespaceCall(params: SdkNamespaceCallParams): Promise<unknown> {
    const namespaceKey = this.normalizeSdkNamespace(params.namespace);
    const allowlist = SDK_NAMESPACE_READ_ALLOWLIST[namespaceKey];
    if (!allowlist) {
      throw new Error(`SDK namespace is not allowlisted for read-only calls: ${params.namespace}`);
    }
    if (!allowlist.has(params.method)) {
      throw new Error(`SDK namespace method is not allowlisted: ${namespaceKey}.${params.method}`);
    }

    const namespaceApi = (this.plugin as any)[namespaceKey];
    if (!namespaceApi) {
      throw new Error(`SDK namespace is unavailable in this RemNote runtime: ${namespaceKey}`);
    }
    const fn = namespaceApi[params.method];
    if (typeof fn !== 'function') {
      throw new Error(`SDK namespace method is unavailable: ${namespaceKey}.${params.method}`);
    }

    const valueDepth = this.clampLimit(params.valueDepth, 4, 8);
    const captured = await this.captureSdkRead(
      () => fn.apply(namespaceApi, Array.isArray(params.args) ? params.args : []),
      valueDepth
    );

    return {
      readOnly: true,
      mutationApplied: false,
      mode: 'sdk_namespace_call',
      namespace: namespaceKey,
      method: params.method,
      argsCount: Array.isArray(params.args) ? params.args.length : 0,
      ...captured,
    };
  }

  async inspectAppContext(params: InspectAppContextParams = {}): Promise<unknown> {
    const valueDepth = this.clampLimit(params.valueDepth, 4, 8);
    const app = (this.plugin as any).app;
    const fields: Record<string, unknown> = {
      operatingSystem: await this.captureSdkRead(() => app.getOperatingSystem(), valueDepth),
      platform: await this.captureSdkRead(() => app.getPlatform(), valueDepth),
    };

    if (params.includeSyncProbe) {
      const timeoutMs = Math.max(250, Math.min(Math.floor(params.syncTimeoutMs || 3000), 15000));
      fields.initialSync = await this.captureSdkRead(() => Promise.race([
        app.waitForInitialSync().then(() => 'settled'),
        new Promise((resolve) => setTimeout(() => resolve(`timeout:${timeoutMs}`), timeoutMs)),
      ]), valueDepth);
    }

    return {
      readOnly: true,
      mutationApplied: false,
      mode: 'inspect_app_context',
      pluginVersion: '2.58.0',
      fields,
    };
  }

  async controlApp(params: ControlAppParams = {}): Promise<unknown> {
    const operation = params.operation || 'status';
    const allowedOperations = new Set([
      'status',
      'waitForInitialSync',
      'transactionProbe',
      'toast',
      'registerCSS',
      'registerStatusBarItem',
      'stealKeys',
      'releaseKeys',
      'registerWidget',
      'unregisterWidget',
      'registerCommand',
      'registerSidebarButton',
      'registerRemMenuItem',
      'registerMenuItem',
      'unregisterMenuItem',
      'registerCallback',
      'registerPowerup',
    ]);
    if (!allowedOperations.has(operation)) {
      throw new Error(`Unsupported app operation: ${operation}`);
    }

    const valueDepth = this.clampLimit(params.valueDepth, 4, 8);
    const before = await this.inspectAppContext({ valueDepth });

    if (operation === 'status') {
      return {
        success: true,
        readOnly: true,
        dryRun: true,
        mutationApplied: false,
        mode: 'control_app',
        pluginVersion: '2.58.0',
        operation,
        before,
      };
    }

    const app = (this.plugin as any).app;
    const confirmationText = 'CONTROL_APP';
    const plannedCall: Record<string, unknown> = {
      namespace: 'app',
      method: operation,
      args: [],
    };
    const preview: Record<string, unknown> = {};
    let readOnlyOperation = false;
    let execute: () => Promise<unknown>;

    const requiredString = (value: unknown, fieldName: string): string => {
      const text = typeof value === 'string' ? value.trim() : '';
      if (!text) throw new Error(`control_app ${operation} requires ${fieldName}.`);
      return text;
    };
    const optionalObject = (value: unknown, fieldName: string): Record<string, unknown> => {
      if (value == null) return {};
      if (typeof value === 'object' && !Array.isArray(value)) return value as Record<string, unknown>;
      throw new Error(`control_app ${operation} ${fieldName} must be an object.`);
    };
    const stringArray = (value: unknown, fieldName: string): string[] => {
      const items = Array.isArray(value)
        ? value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0).map((item) => item.trim())
        : [];
      if (items.length === 0) throw new Error(`control_app ${operation} requires ${fieldName}.`);
      return Array.from(new Set(items)).slice(0, 50);
    };
    const commandPayload = (value: unknown, fieldName: string): Record<string, unknown> => {
      const source = optionalObject(value, fieldName);
      const id = requiredString(source.id ?? params.id, `${fieldName}.id`);
      const name = requiredString(source.name ?? params.name ?? id, `${fieldName}.name`);
      return {
        ...source,
        id,
        name,
        action: async () => {
          const message = typeof source.toastMessage === 'string'
            ? source.toastMessage
            : `MCP app command invoked: ${name}`;
          await app.toast(message);
        },
      };
    };
    const menuItemPayload = (value: unknown): Record<string, unknown> => {
      const source = optionalObject(value, 'menuItem');
      const id = requiredString(source.id ?? params.id, 'menuItem.id');
      const name = requiredString(source.name ?? params.name ?? id, 'menuItem.name');
      const location = requiredString(source.location ?? params.location, 'menuItem.location');
      return {
        ...source,
        id,
        name,
        location,
        action: async () => {
          const message = typeof source.toastMessage === 'string'
            ? source.toastMessage
            : `MCP menu item invoked: ${name}`;
          await app.toast(message);
        },
      };
    };

    if (operation === 'waitForInitialSync') {
      const timeoutMs = Math.max(250, Math.min(Math.floor(params.syncTimeoutMs || 15000), 60000));
      plannedCall.args = [{ timeoutMs }];
      readOnlyOperation = true;
      execute = () => Promise.race([
        app.waitForInitialSync().then(() => 'settled'),
        new Promise((resolve) => setTimeout(() => resolve(`timeout:${timeoutMs}`), timeoutMs)),
      ]);
    } else if (operation === 'transactionProbe') {
      plannedCall.method = 'transaction';
      plannedCall.args = ['<noop function>'];
      readOnlyOperation = true;
      execute = () => app.transaction(() => ({ ok: true, probe: 'noop' }));
    } else if (operation === 'toast') {
      const message = requiredString(params.message, 'message');
      plannedCall.args = [message];
      preview.messageLength = message.length;
      execute = () => app.toast(message);
    } else if (operation === 'registerCSS') {
      const id = requiredString(params.id, 'id');
      const css = requiredString(params.css, 'css');
      plannedCall.args = [id, css];
      preview.cssBytes = css.length;
      execute = () => app.registerCSS(id, css);
    } else if (operation === 'registerStatusBarItem') {
      const id = requiredString(params.id, 'id');
      const html = requiredString(params.html, 'html');
      plannedCall.args = [id, html];
      preview.htmlBytes = html.length;
      execute = () => app.registerStatusBarItem(id, html);
    } else if (operation === 'stealKeys' || operation === 'releaseKeys') {
      const keys = stringArray(params.keys, 'keys');
      plannedCall.args = [keys];
      execute = () => operation === 'stealKeys' ? app.stealKeys(keys) : app.releaseKeys(keys);
    } else if (operation === 'registerWidget') {
      const fileName = requiredString(params.fileName, 'fileName');
      const location = requiredString(params.location, 'location');
      const options = optionalObject(params.options, 'options');
      plannedCall.args = [fileName, location, options];
      execute = () => app.registerWidget(fileName, location, options);
    } else if (operation === 'unregisterWidget') {
      const fileName = requiredString(params.fileName, 'fileName');
      const location = requiredString(params.location, 'location');
      plannedCall.args = [fileName, location];
      execute = () => app.unregisterWidget(fileName, location);
    } else if (operation === 'registerCommand' || operation === 'registerSidebarButton' || operation === 'registerRemMenuItem') {
      const command = commandPayload(params.command, 'command');
      plannedCall.args = [{ ...command, action: '<generated toast callback>' }];
      execute = () => app[operation](command);
    } else if (operation === 'registerMenuItem') {
      const menuItem = menuItemPayload(params.menuItem);
      plannedCall.args = [{ ...menuItem, action: '<generated toast callback>' }];
      execute = () => app.registerMenuItem(menuItem);
    } else if (operation === 'unregisterMenuItem') {
      const id = requiredString(params.id, 'id');
      plannedCall.args = [id];
      execute = () => app.unregisterMenuItem(id);
    } else if (operation === 'registerCallback') {
      const callbackId = requiredString(params.callbackId ?? params.id, 'callbackId');
      plannedCall.args = [callbackId, '<generated echo callback>'];
      execute = async () => {
        app.registerCallback(callbackId, async (...args: unknown[]) => ({
          ok: true,
          callbackId,
          argsCount: args.length,
        }));
        return { callbackId };
      };
    } else if (operation === 'registerPowerup') {
      const name = requiredString(params.name, 'name');
      const code = requiredString(params.code, 'code');
      const description = typeof params.description === 'string' ? params.description : '';
      const options = optionalObject(params.options, 'options');
      plannedCall.args = [{ name, code, description, options }];
      execute = () => app.registerPowerup({ name, code, description, options });
    } else {
      throw new Error(`Unsupported app operation: ${operation}`);
    }

    if (params.dryRun === true || (!readOnlyOperation && params.confirm !== confirmationText)) {
      return {
        success: false,
        requiresConfirmation: params.dryRun === true || readOnlyOperation ? false : true,
        confirmationText,
        readOnly: params.dryRun === true || readOnlyOperation,
        dryRun: params.dryRun === true,
        mutationApplied: false,
        mode: 'control_app',
        pluginVersion: '2.58.0',
        operation,
        reason: params.dryRun === true
          ? 'Dry run only; app action was not executed.'
          : 'Confirmation text is required before controlling RemNote app/runtime UI registrations.',
        plannedCall,
        ...(Object.keys(preview).length > 0 ? { preview } : {}),
        before,
      };
    }

    let success = false;
    let result: unknown;
    let error: string | undefined;
    try {
      result = await execute();
      success = true;
    } catch (err) {
      error = err instanceof Error ? err.message : String(err);
    }

    const after = await this.inspectAppContext({ valueDepth });
    return {
      success,
      readOnly: readOnlyOperation,
      dryRun: false,
      mutationApplied: success && !readOnlyOperation,
      mode: 'control_app',
      pluginVersion: '2.58.0',
      operation,
      plannedCall,
      result: await this.serializeForBridge(result, valueDepth),
      ...(error ? { error } : {}),
      before,
      after,
    };
  }

  private async inspectWindowContext(valueDepth: number): Promise<unknown> {
    const win = (this.plugin as any).window;
    const fields: Record<string, unknown> = {
      currentWindowTree: await this.captureSdkRead(() => win.getCurrentWindowTree(), valueDepth),
      lastFocusedPane: await this.captureSdkRead(() => win.getLastFocusedPane(), valueDepth),
      openPaneIds: await this.captureSdkRead(() => win.getOpenPaneIds(), valueDepth),
      focusedPaneId: await this.captureSdkRead(() => win.getFocusedPaneId(), valueDepth),
      url: await this.captureSdkRead(() => win.getURL(), valueDepth),
      openPaneRemIds: await this.captureSdkRead(() => win.getOpenPaneRemIds(), valueDepth),
      focusedPaneRemId: await this.captureSdkRead(async () => {
        const focusedPaneId = await win.getFocusedPaneId();
        return win.getOpenPaneRemId(focusedPaneId);
      }, valueDepth),
    };

    return {
      readOnly: true,
      mutationApplied: false,
      mode: 'inspect_window_context',
      pluginVersion: '2.58.0',
      fields,
    };
  }

  async controlWindow(params: ControlWindowParams = {}): Promise<unknown> {
    const operation = params.operation || 'status';
    const allowedOperations = new Set([
      'status',
      'isFloatingWidgetOpen',
      'setFocusedPaneId',
      'setURL',
      'openRem',
      'setRemWindowTree',
      'setCurrentWindowTreeFromString',
      'openFloatingWidget',
      'closeFloatingWidget',
      'setFloatingWidgetPosition',
      'closeAllFloatingWidgets',
      'stealKeys',
      'releaseKeys',
      'openWidgetInPane',
      'openWidgetInRightSidebar',
    ]);
    if (!allowedOperations.has(operation)) {
      throw new Error(`Unsupported window operation: ${operation}`);
    }

    const valueDepth = this.clampLimit(params.valueDepth, 4, 8);
    const before = await this.inspectWindowContext(valueDepth);

    if (operation === 'status') {
      return {
        success: true,
        readOnly: true,
        dryRun: true,
        mutationApplied: false,
        mode: 'control_window',
        pluginVersion: '2.58.0',
        operation,
        before,
      };
    }

    const win = (this.plugin as any).window;
    const confirmationText = 'CONTROL_WINDOW';
    const plannedCall: Record<string, unknown> = {
      namespace: 'window',
      method: operation,
      args: [],
    };
    const preview: Record<string, unknown> = {};
    let readOnlyOperation = false;
    let execute: () => Promise<unknown>;

    const requiredString = (value: unknown, fieldName: string): string => {
      const text = typeof value === 'string' ? value.trim() : '';
      if (!text) throw new Error(`control_window ${operation} requires ${fieldName}.`);
      return text;
    };
    const optionalObject = (value: unknown, fieldName: string): Record<string, unknown> => {
      if (value == null) return {};
      if (typeof value === 'object' && !Array.isArray(value)) return value as Record<string, unknown>;
      throw new Error(`control_window ${operation} ${fieldName} must be an object.`);
    };
    const stringArray = (value: unknown, fieldName: string): string[] => {
      const items = Array.isArray(value)
        ? value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0).map((item) => item.trim())
        : [];
      if (items.length === 0) throw new Error(`control_window ${operation} requires ${fieldName}.`);
      return Array.from(new Set(items)).slice(0, 50);
    };
    const positionObject = (): Record<string, number> => {
      const source = optionalObject(params.position, 'position');
      const position: Record<string, number> = {};
      for (const key of ['top', 'left', 'right', 'bottom']) {
        const value = source[key];
        if (typeof value === 'number' && Number.isFinite(value)) position[key] = value;
      }
      if (Object.keys(position).length === 0) {
        throw new Error(`control_window ${operation} requires position with at least one numeric top/left/right/bottom value.`);
      }
      return position;
    };

    if (operation === 'isFloatingWidgetOpen') {
      const floatingWidgetId = requiredString(params.floatingWidgetId, 'floatingWidgetId');
      plannedCall.args = [floatingWidgetId];
      readOnlyOperation = true;
      execute = () => win.isFloatingWidgetOpen(floatingWidgetId);
    } else if (operation === 'setFocusedPaneId') {
      const paneId = requiredString(params.paneId, 'paneId');
      plannedCall.args = [paneId];
      execute = () => win.setFocusedPaneId(paneId);
    } else if (operation === 'setURL') {
      const url = requiredString(params.url, 'url');
      plannedCall.args = [url];
      preview.url = url;
      execute = () => win.setURL(url);
    } else if (operation === 'openRem') {
      const remId = requiredString(params.remId, 'remId');
      plannedCall.args = [remId];
      execute = async () => {
        const rem = await this.plugin.rem.findOne(remId);
        if (!rem) throw new Error(`Rem not found: ${remId}`);
        await win.openRem(rem);
        return { remId, title: await this.getRemText(rem) };
      };
    } else if (operation === 'setRemWindowTree') {
      const tree = optionalObject(params.tree, 'tree');
      plannedCall.args = [tree];
      execute = () => win.setRemWindowTree(tree);
    } else if (operation === 'setCurrentWindowTreeFromString') {
      const treeString = requiredString(params.treeString, 'treeString');
      plannedCall.args = [treeString];
      preview.treeStringLength = treeString.length;
      execute = () => win.setCurrentWindowTreeFromString(treeString);
    } else if (operation === 'openFloatingWidget') {
      const fileName = requiredString(params.fileName, 'fileName');
      const position = positionObject();
      plannedCall.args = [fileName, position, params.classContainer, params.closeWhenClickOutside === true];
      execute = () => win.openFloatingWidget(fileName, position, params.classContainer, params.closeWhenClickOutside === true);
    } else if (operation === 'closeFloatingWidget') {
      const floatingWidgetId = requiredString(params.floatingWidgetId, 'floatingWidgetId');
      plannedCall.args = [floatingWidgetId];
      execute = () => win.closeFloatingWidget(floatingWidgetId);
    } else if (operation === 'setFloatingWidgetPosition') {
      const floatingWidgetId = requiredString(params.floatingWidgetId, 'floatingWidgetId');
      const position = positionObject();
      plannedCall.args = [floatingWidgetId, position];
      execute = () => win.setFloatingWidgetPosition(floatingWidgetId, position);
    } else if (operation === 'closeAllFloatingWidgets') {
      execute = () => win.closeAllFloatingWidgets();
    } else if (operation === 'stealKeys' || operation === 'releaseKeys') {
      const floatingWidgetId = requiredString(params.floatingWidgetId, 'floatingWidgetId');
      const keys = stringArray(params.keys, 'keys');
      plannedCall.args = [floatingWidgetId, keys];
      execute = () => operation === 'stealKeys' ? win.stealKeys(floatingWidgetId, keys) : win.releaseKeys(floatingWidgetId, keys);
    } else if (operation === 'openWidgetInPane' || operation === 'openWidgetInRightSidebar') {
      const fileName = requiredString(params.fileName, 'fileName');
      const contextData = optionalObject(params.contextData, 'contextData');
      plannedCall.args = [fileName, contextData];
      execute = () => operation === 'openWidgetInPane'
        ? win.openWidgetInPane(fileName, contextData)
        : win.openWidgetInRightSidebar(fileName, contextData);
    } else {
      throw new Error(`Unsupported window operation: ${operation}`);
    }

    if (params.dryRun === true || (!readOnlyOperation && params.confirm !== confirmationText)) {
      return {
        success: false,
        requiresConfirmation: params.dryRun === true || readOnlyOperation ? false : true,
        confirmationText,
        readOnly: params.dryRun === true || readOnlyOperation,
        dryRun: params.dryRun === true,
        mutationApplied: false,
        mode: 'control_window',
        pluginVersion: '2.58.0',
        operation,
        reason: params.dryRun === true
          ? 'Dry run only; window action was not executed.'
          : 'Confirmation text is required before controlling RemNote window, pane, URL, or widget state.',
        plannedCall,
        ...(Object.keys(preview).length > 0 ? { preview } : {}),
        before,
      };
    }

    let success = false;
    let result: unknown;
    let error: string | undefined;
    try {
      result = await execute();
      success = true;
    } catch (err) {
      error = err instanceof Error ? err.message : String(err);
    }

    const after = await this.inspectWindowContext(valueDepth);
    return {
      success,
      readOnly: readOnlyOperation,
      dryRun: false,
      mutationApplied: success && !readOnlyOperation,
      mode: 'control_window',
      pluginVersion: '2.58.0',
      operation,
      plannedCall,
      result: await this.serializeForBridge(result, valueDepth),
      ...(error ? { error } : {}),
      before,
      after,
    };
  }

  async inspectEditorContext(params: InspectEditorContextParams = {}): Promise<unknown> {
    const valueDepth = this.clampLimit(params.valueDepth, 4, 8);
    const editor = (this.plugin as any).editor;
    const win = (this.plugin as any).window;
    const fields: Record<string, unknown> = {
      selection: await this.captureSdkRead(() => editor.getSelection(), valueDepth),
      selectedRem: await this.captureSdkRead(() => editor.getSelectedRem(), valueDepth),
      selectedText: await this.captureSdkRead(() => editor.getSelectedText(), valueDepth),
      caretPosition: await this.captureSdkRead(() => editor.getCaretPosition(), valueDepth),
      focusedPaneId: await this.captureSdkRead(() => win.getFocusedPaneId(), valueDepth),
      focusedPaneRemId: await this.captureSdkRead(async () => {
        const focusedPaneId = await win.getFocusedPaneId();
        return win.getOpenPaneRemId(focusedPaneId);
      }, valueDepth),
    };

    if (params.includeFocusedText !== false) {
      fields.focusedEditorText = await this.captureSdkRead(() => editor.getFocusedEditorText(), valueDepth);
    }

    return {
      readOnly: true,
      mutationApplied: false,
      mode: 'inspect_editor_context',
      pluginVersion: '2.58.0',
      fields,
    };
  }

  private normalizeEditorDirection(value: unknown, fallback: -1 | 1 = 1): -1 | 1 {
    const numeric = typeof value === 'number' ? value : Number(value);
    return numeric < 0 ? -1 : numeric > 0 ? 1 : fallback;
  }

  private normalizeEditorMoveUnit(value: unknown): number {
    if (typeof value === 'number' && Number.isFinite(value)) return Math.max(0, Math.floor(value));
    const key = String(value ?? 'character').trim().toLocaleLowerCase('en-US').replace(/[\s-]+/g, '_');
    const units: Record<string, number> = {
      offset: 0,
      unit: 1,
      character: 2,
      char: 2,
      word: 3,
      word_start: 4,
      word_end: 5,
      line: 6,
    };
    if (Object.prototype.hasOwnProperty.call(units, key)) return units[key];
    throw new Error('control_editor moveCaret requires unit: offset, unit, character, word, word_start, word_end, line, or numeric MoveUnit.');
  }

  async controlEditor(params: ControlEditorParams = {}): Promise<unknown> {
    const operation = params.operation || 'status';
    const allowedOperations = new Set([
      'status',
      'setText',
      'copy',
      'cut',
      'deleteCharacters',
      'delete',
      'selectRem',
      'selectText',
      'collapseSelection',
      'undo',
      'redo',
      'moveCaret',
      'moveCaretVertical',
      'insertPlainText',
      'insertRichText',
      'insertMarkdown',
    ]);
    if (!allowedOperations.has(operation)) {
      throw new Error(`Unsupported editor operation: ${operation}`);
    }

    const valueDepth = this.clampLimit(params.valueDepth, 4, 8);
    const before = await this.inspectEditorContext({
      includeFocusedText: params.includeFocusedText,
      valueDepth,
    });

    if (operation === 'status') {
      return {
        success: true,
        readOnly: true,
        dryRun: true,
        mutationApplied: false,
        mode: 'control_editor',
        pluginVersion: '2.58.0',
        operation,
        before,
      };
    }

    const editor = (this.plugin as any).editor;
    const confirmationText = 'CONTROL_EDITOR';
    const plannedCall: Record<string, unknown> = {
      namespace: 'editor',
      method: operation,
      args: [],
    };
    const preview: Record<string, unknown> = {};
    let execute: () => Promise<unknown>;

    if (operation === 'setText' || operation === 'insertRichText') {
      const richText = await this.richTextFromParams(params);
      plannedCall.args = ['<RichTextInterface>'];
      preview.richText = await this.summarizeRichText(richText, {
        includeMarkdown: true,
        includeString: true,
        valueDepth,
      });
      execute = () => operation === 'setText' ? editor.setText(richText) : editor.insertRichText(richText);
    } else if (operation === 'insertPlainText') {
      const text = typeof params.text === 'string' ? params.text : '';
      plannedCall.args = [text];
      preview.textLength = text.length;
      execute = () => editor.insertPlainText(text);
    } else if (operation === 'insertMarkdown') {
      const markdown = typeof params.markdown === 'string' ? params.markdown : '';
      plannedCall.args = [markdown];
      preview.markdownLength = markdown.length;
      execute = () => editor.insertMarkdown(markdown);
    } else if (operation === 'deleteCharacters') {
      const characters = Math.max(1, Math.min(Math.floor(params.characters ?? 1), 10000));
      const direction = this.normalizeEditorDirection(params.direction, -1);
      plannedCall.args = [characters, direction];
      execute = () => editor.deleteCharacters(characters, direction);
    } else if (operation === 'selectRem') {
      const remIds = Array.isArray(params.remIds)
        ? params.remIds.filter((id): id is string => typeof id === 'string' && id.trim().length > 0)
        : [];
      if (remIds.length === 0) throw new Error('control_editor selectRem requires remIds.');
      plannedCall.args = params.portalId ? [remIds, params.portalId] : [remIds];
      execute = () => editor.selectRem(remIds, params.portalId);
    } else if (operation === 'selectText') {
      if (!params.range || typeof params.range !== 'object') throw new Error('control_editor selectText requires range object.');
      plannedCall.args = [params.range];
      execute = () => editor.selectText(params.range);
    } else if (operation === 'collapseSelection') {
      const to = params.to === 'end' ? 'end' : 'start';
      plannedCall.args = [to];
      execute = () => editor.collapseSelection(to);
    } else if (operation === 'moveCaret') {
      const amount = Number.isFinite(params.amount) ? Math.floor(params.amount as number) : 1;
      const unit = this.normalizeEditorMoveUnit(params.unit);
      plannedCall.args = [amount, unit];
      execute = () => editor.moveCaret(amount, unit);
    } else if (operation === 'moveCaretVertical') {
      const direction = this.normalizeEditorDirection(params.direction, 1);
      plannedCall.args = [direction];
      execute = () => editor.moveCaretVertical(direction);
    } else if (operation === 'copy') {
      execute = () => editor.copy();
    } else if (operation === 'cut') {
      execute = () => editor.cut();
    } else if (operation === 'delete') {
      execute = () => editor.delete();
    } else if (operation === 'undo') {
      execute = () => editor.undo();
    } else if (operation === 'redo') {
      execute = () => editor.redo();
    } else {
      throw new Error(`Unsupported editor operation: ${operation}`);
    }

    if (params.dryRun === true || params.confirm !== confirmationText) {
      return {
        success: false,
        requiresConfirmation: params.dryRun === true ? false : true,
        confirmationText,
        readOnly: params.dryRun === true,
        dryRun: params.dryRun === true,
        mutationApplied: false,
        mode: 'control_editor',
        pluginVersion: '2.58.0',
        operation,
        reason: params.dryRun === true
          ? 'Dry run only; editor action was not executed.'
          : 'Confirmation text is required before controlling the live RemNote editor.',
        plannedCall,
        ...(Object.keys(preview).length > 0 ? { preview } : {}),
        before,
      };
    }

    let success = false;
    let result: unknown;
    let error: string | undefined;
    try {
      result = await execute();
      success = true;
    } catch (err) {
      error = err instanceof Error ? err.message : String(err);
    }

    const after = await this.inspectEditorContext({
      includeFocusedText: params.includeFocusedText,
      valueDepth,
    });

    return {
      success,
      readOnly: false,
      dryRun: false,
      mutationApplied: success && operation !== 'copy',
      mode: 'control_editor',
      pluginVersion: '2.58.0',
      operation,
      plannedCall,
      result: await this.serializeForBridge(result, valueDepth),
      ...(error ? { error } : {}),
      before,
      after,
    };
  }

  async inspectQueueContext(params: InspectQueueContextParams = {}): Promise<unknown> {
    const valueDepth = this.clampLimit(params.valueDepth, 4, 8);
    const queue = (this.plugin as any).queue;
    const fields: Record<string, unknown> = {
      averageTimePerCard: await this.captureSdkRead(() => queue.getAverageTimePerCard(), valueDepth),
      currentQueueScreenType: await this.captureSdkRead(() => queue.getCurrentQueueScreenType(), valueDepth),
      hasRevealedAnswer: await this.captureSdkRead(() => queue.hasRevealedAnswer(), valueDepth),
      isTypeAnswerEnabled: await this.captureSdkRead(() => queue.isTypeAnswerEnabled(), valueDepth),
      numRemainingCards: await this.captureSdkRead(() => queue.getNumRemainingCards(), valueDepth),
      currentStreak: await this.captureSdkRead(() => queue.getCurrentStreak(), valueDepth),
      inLookbackMode: await this.captureSdkRead(() => queue.inLookbackMode(), valueDepth),
    };

    if (params.includeCurrentCard !== false) {
      fields.currentCard = await this.captureSdkRead(() => queue.getCurrentCard(), valueDepth);
    }

    return {
      readOnly: true,
      mutationApplied: false,
      mode: 'inspect_queue_context',
      pluginVersion: '2.58.0',
      fields,
    };
  }

  private normalizeQueueInteractionScore(score: unknown): number {
    if (typeof score === 'number' && Number.isFinite(score)) return score;
    const key = String(score ?? '').trim().toLocaleLowerCase('en-US').replace(/[\s-]+/g, '_');
    const scores: Record<string, number> = {
      too_early: 0.01,
      again: 0,
      hard: 0.5,
      good: 1,
      easy: 1.5,
      viewed_as_leech: 2,
      leech: 2,
      reset: 3,
      manual_date: 4,
      manual_ease: 5,
    };
    if (Object.prototype.hasOwnProperty.call(scores, key)) return scores[key];
    throw new Error('Queue interaction score must be again, hard, good, easy, too_early, viewed_as_leech, reset, manual_date, manual_ease, or a numeric QueueInteractionScore.');
  }

  async controlPracticeQueue(params: ControlPracticeQueueParams = {}): Promise<unknown> {
    const operation = params.operation || 'status';
    const allowedOperations = new Set(['status', 'showAnswer', 'rateCurrentCard', 'goBackToPreviousCard', 'removeCurrentCardFromQueue']);
    if (!allowedOperations.has(operation)) {
      throw new Error(`Unsupported practice queue operation: ${operation}`);
    }

    const valueDepth = this.clampLimit(params.valueDepth, 4, 8);
    const includeCurrentCard = params.includeCurrentCard !== false;
    const before = await this.inspectQueueContext({ includeCurrentCard, valueDepth });

    if (operation === 'status') {
      return {
        success: true,
        readOnly: true,
        dryRun: true,
        mutationApplied: false,
        mode: 'control_practice_queue',
        pluginVersion: '2.58.0',
        operation,
        before,
      };
    }

    const confirmationText = 'CONTROL_PRACTICE_QUEUE';
    const queue = (this.plugin as any).queue;
    const score = operation === 'rateCurrentCard' ? this.normalizeQueueInteractionScore(params.score) : undefined;
    const plannedCall = {
      namespace: 'queue',
      method: operation,
      args: operation === 'rateCurrentCard'
        ? [score]
        : operation === 'removeCurrentCardFromQueue'
          ? [params.addToBackStack === true]
          : [],
    };

    if (params.dryRun === true || params.confirm !== confirmationText) {
      return {
        success: false,
        requiresConfirmation: params.dryRun === true ? false : true,
        confirmationText,
        readOnly: params.dryRun === true,
        dryRun: params.dryRun === true,
        mutationApplied: false,
        mode: 'control_practice_queue',
        pluginVersion: '2.58.0',
        operation,
        reason: params.dryRun === true
          ? 'Dry run only; queue action was not executed.'
          : 'Confirmation text is required before controlling the live RemNote practice queue.',
        plannedCall,
        before,
      };
    }

    let success = false;
    let error: string | undefined;
    try {
      if (operation === 'showAnswer') {
        await queue.showAnswer();
      } else if (operation === 'rateCurrentCard') {
        await queue.rateCurrentCard(score);
      } else if (operation === 'goBackToPreviousCard') {
        await queue.goBackToPreviousCard();
      } else if (operation === 'removeCurrentCardFromQueue') {
        await queue.removeCurrentCardFromQueue(params.addToBackStack === true);
      }
      success = true;
    } catch (err) {
      error = err instanceof Error ? err.message : String(err);
    }

    const after = await this.inspectQueueContext({ includeCurrentCard, valueDepth });
    return {
      success,
      readOnly: false,
      dryRun: false,
      mutationApplied: success,
      mode: 'control_practice_queue',
      pluginVersion: '2.58.0',
      operation,
      plannedCall,
      ...(error ? { error } : {}),
      before,
      after,
    };
  }

  async inspectPluginRuntime(params: InspectPluginRuntimeParams = {}): Promise<unknown> {
    const valueDepth = this.clampLimit(params.valueDepth, 4, 8);
    const settingsApi = (this.plugin as any).settings;
    const storageApi = (this.plugin as any).storage;
    const kbApi = (this.plugin as any).kb;
    const defaultSettingIds = [
      SETTING_AUTO_TAG_ENABLED,
      SETTING_AUTO_TAG,
      SETTING_JOURNAL_PREFIX,
      SETTING_JOURNAL_TIMESTAMP,
      SETTING_WS_URL,
      SETTING_DEFAULT_PARENT,
    ];
    const defaultStorageKeys = [
      STORAGE_RUNTIME_STATUS,
      STORAGE_SIDEBAR_SHORTCUTS,
    ];
    const maxKeys = 20;
    const normalizeKeys = (values: string[] | undefined, fallback: string[]) => Array.from(new Set(
      (Array.isArray(values) && values.length > 0 ? values : fallback)
        .filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
        .map((value) => value.trim())
    )).slice(0, maxKeys);
    const settingIds = normalizeKeys(params.settingIds, defaultSettingIds);
    const storageKeys = normalizeKeys(params.storageKeys, defaultStorageKeys);
    const fields: Record<string, unknown> = {
      currentSettings: {
        ...this.settings,
        defaults: {
          autoTag: DEFAULT_AUTO_TAG,
          journalPrefix: DEFAULT_JOURNAL_PREFIX,
          wsUrl: DEFAULT_WS_URL,
        },
      },
    };

    if (params.includeSettings !== false) {
      const settings: Record<string, unknown> = {};
      for (const settingId of settingIds) {
        settings[settingId] = await this.captureSdkRead(() => settingsApi.getSetting(settingId), valueDepth);
      }
      fields.settings = settings;
    }

    if (params.includeStorage !== false) {
      const storage: Record<string, unknown> = {};
      for (const key of storageKeys) {
        storage[key] = {
          synced: await this.captureSdkRead(() => storageApi.getSynced(key), valueDepth),
          local: await this.captureSdkRead(() => storageApi.getLocal(key), valueDepth),
          session: await this.captureSdkRead(() => storageApi.getSession(key), valueDepth),
        };
      }
      fields.storage = storage;
    }

    if (params.includeKnowledgeBase !== false) {
      fields.knowledgeBase = {
        current: await this.captureSdkRead(() => kbApi.getCurrentKnowledgeBaseData(), valueDepth),
        isPrimary: await this.captureSdkRead(() => kbApi.isPrimaryKnowledgeBase(), valueDepth),
      };
    }

    return {
      readOnly: true,
      mutationApplied: false,
      mode: 'inspect_plugin_runtime',
      pluginVersion: '2.58.0',
      fields,
    };
  }

  private normalizePluginStorageArea(value: unknown): 'session' | 'synced' | 'local' {
    const key = String(value || 'session').trim().toLocaleLowerCase('en-US');
    if (key === 'session' || key === 'synced' || key === 'local') return key;
    throw new Error('control_plugin_runtime storageArea must be session, synced, or local.');
  }

  async controlPluginRuntime(params: ControlPluginRuntimeParams = {}): Promise<unknown> {
    const operation = params.operation || 'status';
    const allowedOperations = new Set([
      'status',
      'storageGet',
      'storageSet',
      'getSetting',
      'registerSetting',
      'getWidgetsAtLocation',
      'getWidgetContext',
      'getWidgetDimensions',
      'openPopup',
      'closePopup',
      'broadcast',
    ]);
    if (!allowedOperations.has(operation)) {
      throw new Error(`Unsupported plugin runtime operation: ${operation}`);
    }

    const valueDepth = this.clampLimit(params.valueDepth, 4, 8);
    const before = await this.inspectPluginRuntime({ valueDepth });

    if (operation === 'status') {
      return {
        success: true,
        readOnly: true,
        dryRun: true,
        mutationApplied: false,
        mode: 'control_plugin_runtime',
        pluginVersion: '2.58.0',
        operation,
        before,
      };
    }

    const storageApi = (this.plugin as any).storage;
    const settingsApi = (this.plugin as any).settings;
    const widgetApi = (this.plugin as any).widget;
    const messagingApi = (this.plugin as any).messaging;
    const confirmationText = 'CONTROL_PLUGIN_RUNTIME';
    const plannedCall: Record<string, unknown> = {
      namespace: 'plugin_runtime',
      method: operation,
      args: [],
    };
    const preview: Record<string, unknown> = {};
    let readOnlyOperation = false;
    let execute: () => Promise<unknown>;

    const requiredString = (value: unknown, fieldName: string): string => {
      const text = typeof value === 'string' ? value.trim() : '';
      if (!text) throw new Error(`control_plugin_runtime ${operation} requires ${fieldName}.`);
      return text;
    };
    const optionalObject = (value: unknown, fieldName: string): Record<string, unknown> => {
      if (value == null) return {};
      if (typeof value === 'object' && !Array.isArray(value)) return value as Record<string, unknown>;
      throw new Error(`control_plugin_runtime ${operation} ${fieldName} must be an object.`);
    };
    const settingPayload = (): Record<string, unknown> => {
      const source = optionalObject(params.setting, 'setting');
      const id = requiredString(source.id ?? params.settingId ?? params.key, 'setting.id');
      const title = requiredString(source.title ?? source.name ?? id, 'setting.title');
      return {
        ...source,
        id,
        title,
      };
    };

    if (operation === 'storageGet') {
      const key = requiredString(params.key, 'key');
      const storageArea = this.normalizePluginStorageArea(params.storageArea);
      plannedCall.namespace = 'storage';
      plannedCall.method = storageArea === 'session' ? 'getSession' : storageArea === 'synced' ? 'getSynced' : 'getLocal';
      plannedCall.args = [key];
      readOnlyOperation = true;
      execute = () => storageArea === 'session'
        ? storageApi.getSession(key)
        : storageArea === 'synced'
          ? storageApi.getSynced(key)
          : storageApi.getLocal(key);
    } else if (operation === 'storageSet') {
      const key = requiredString(params.key, 'key');
      const storageArea = this.normalizePluginStorageArea(params.storageArea);
      plannedCall.namespace = 'storage';
      plannedCall.method = storageArea === 'session' ? 'setSession' : storageArea === 'synced' ? 'setSynced' : 'setLocal';
      plannedCall.args = [key, '<value>'];
      preview.storageArea = storageArea;
      preview.value = await this.serializeForBridge(params.value, valueDepth);
      execute = () => storageArea === 'session'
        ? storageApi.setSession(key, params.value)
        : storageArea === 'synced'
          ? storageApi.setSynced(key, params.value)
          : storageApi.setLocal(key, params.value);
    } else if (operation === 'getSetting') {
      const settingId = requiredString(params.settingId ?? params.key, 'settingId');
      plannedCall.namespace = 'settings';
      plannedCall.method = 'getSetting';
      plannedCall.args = [settingId];
      readOnlyOperation = true;
      execute = () => settingsApi.getSetting(settingId);
    } else if (operation === 'registerSetting') {
      const settingType = String(params.settingType || 'string').trim().toLocaleLowerCase('en-US');
      const setting = settingPayload();
      plannedCall.namespace = 'settings';
      plannedCall.args = [setting];
      if (settingType === 'dropdown') {
        plannedCall.method = 'registerDropdownSetting';
        execute = () => settingsApi.registerDropdownSetting(setting);
      } else if (settingType === 'boolean') {
        plannedCall.method = 'registerBooleanSetting';
        execute = () => settingsApi.registerBooleanSetting(setting);
      } else if (settingType === 'number') {
        plannedCall.method = 'registerNumberSetting';
        execute = () => settingsApi.registerNumberSetting(setting);
      } else if (settingType === 'string') {
        plannedCall.method = 'registerStringSetting';
        execute = () => settingsApi.registerStringSetting(setting);
      } else {
        throw new Error('control_plugin_runtime registerSetting settingType must be dropdown, boolean, string, or number.');
      }
      preview.settingType = settingType;
      preview.settingId = setting.id;
    } else if (operation === 'getWidgetsAtLocation') {
      const location = requiredString(params.location, 'location');
      plannedCall.namespace = 'widget';
      plannedCall.method = 'getWidgetsAtLocation';
      plannedCall.args = params.remId ? [location, params.remId] : [location];
      readOnlyOperation = true;
      execute = () => widgetApi.getWidgetsAtLocation(location, params.remId);
    } else if (operation === 'getWidgetContext') {
      plannedCall.namespace = 'widget';
      plannedCall.method = 'getWidgetContext';
      readOnlyOperation = true;
      execute = () => widgetApi.getWidgetContext();
    } else if (operation === 'getWidgetDimensions') {
      const widgetInstanceId = Number(params.widgetInstanceId);
      if (!Number.isFinite(widgetInstanceId)) {
        throw new Error('control_plugin_runtime getWidgetDimensions requires numeric widgetInstanceId.');
      }
      plannedCall.namespace = 'widget';
      plannedCall.method = 'getDimensions';
      plannedCall.args = [widgetInstanceId];
      readOnlyOperation = true;
      execute = () => widgetApi.getDimensions(widgetInstanceId);
    } else if (operation === 'openPopup') {
      const fileName = requiredString(params.fileName, 'fileName');
      plannedCall.namespace = 'widget';
      plannedCall.method = 'openPopup';
      plannedCall.args = [fileName, params.contextData ?? {}, params.clickOutsideToClose === true];
      execute = () => widgetApi.openPopup(fileName, params.contextData ?? {}, params.clickOutsideToClose === true);
    } else if (operation === 'closePopup') {
      plannedCall.namespace = 'widget';
      plannedCall.method = 'closePopup';
      plannedCall.args = [params.restoreFocus !== false];
      execute = () => widgetApi.closePopup(params.restoreFocus !== false);
    } else if (operation === 'broadcast') {
      plannedCall.namespace = 'messaging';
      plannedCall.method = 'broadcast';
      plannedCall.args = ['<message>'];
      preview.message = await this.serializeForBridge(params.message, valueDepth);
      execute = () => messagingApi.broadcast(params.message);
    } else {
      throw new Error(`Unsupported plugin runtime operation: ${operation}`);
    }

    if (params.dryRun === true || (!readOnlyOperation && params.confirm !== confirmationText)) {
      return {
        success: false,
        requiresConfirmation: params.dryRun === true || readOnlyOperation ? false : true,
        confirmationText,
        readOnly: params.dryRun === true || readOnlyOperation,
        dryRun: params.dryRun === true,
        mutationApplied: false,
        mode: 'control_plugin_runtime',
        pluginVersion: '2.58.0',
        operation,
        reason: params.dryRun === true
          ? 'Dry run only; plugin runtime action was not executed.'
          : 'Confirmation text is required before writing plugin storage, registering settings/widgets, opening popups, or broadcasting plugin messages.',
        plannedCall,
        ...(Object.keys(preview).length > 0 ? { preview } : {}),
        before,
      };
    }

    let success = false;
    let result: unknown;
    let error: string | undefined;
    try {
      result = await execute();
      success = true;
    } catch (err) {
      error = err instanceof Error ? err.message : String(err);
    }

    const after = await this.inspectPluginRuntime({ valueDepth });
    return {
      success,
      readOnly: readOnlyOperation,
      dryRun: false,
      mutationApplied: success && !readOnlyOperation,
      mode: 'control_plugin_runtime',
      pluginVersion: '2.58.0',
      operation,
      plannedCall,
      result: await this.serializeForBridge(result, valueDepth),
      ...(error ? { error } : {}),
      before,
      after,
    };
  }

  async inspectPowerupRegistry(params: InspectPowerupRegistryParams = {}): Promise<unknown> {
    const valueDepth = this.clampLimit(params.valueDepth, 4, 8);
    const powerupLimit = this.clampLimit(params.powerupLimit, 20, 100);
    const slotLimit = this.clampLimit(params.slotLimit, 40, 300);
    const includeDefaultPowerups = params.includeDefaultPowerups !== false;
    const normalizeCodeList = (values: unknown[] | undefined, fallback: string[]) => Array.from(new Set(
      (Array.isArray(values) && values.length > 0 ? values : fallback)
        .map((value) => typeof value === 'string' ? value.trim() : '')
        .filter((value) => value.length > 0)
    ));
    const powerupCodes = normalizeCodeList(
      params.powerupCodes,
      includeDefaultPowerups ? DEFAULT_POWERUP_CODES : []
    ).slice(0, powerupLimit);
    const powerupApi = (this.plugin as any).powerup;
    const powerups: Record<string, unknown> = {};
    for (const code of powerupCodes) {
      powerups[code] = await this.captureSdkRead(() => powerupApi.getPowerupByCode(code), valueDepth);
    }

    const requestedSlots = params.slotsByPowerupCode || {};
    const slotRows: Array<{ powerupCode: string; slotCode: string; result: unknown }> = [];
    if (params.includeSlots !== false) {
      let usedSlots = 0;
      const defaultSlotCodes = includeDefaultPowerups ? Object.keys(DEFAULT_POWERUP_SLOT_CODES) : [];
      const allSlotCodes = new Set([...defaultSlotCodes, ...Object.keys(requestedSlots)]);
      for (const powerupCode of allSlotCodes) {
        const slots = normalizeCodeList(
          requestedSlots[powerupCode],
          DEFAULT_POWERUP_SLOT_CODES[powerupCode] || []
        );
        for (const slotCode of slots) {
          if (usedSlots >= slotLimit) break;
          usedSlots += 1;
          slotRows.push({
            powerupCode,
            slotCode,
            result: await this.captureSdkRead(() => powerupApi.getPowerupSlotByCode(powerupCode, slotCode), valueDepth),
          });
        }
        if (usedSlots >= slotLimit) break;
      }
    }

    return {
      readOnly: true,
      mutationApplied: false,
      mode: 'inspect_powerup_registry',
      pluginVersion: '2.58.0',
      powerupCount: powerupCodes.length,
      slotProbeCount: slotRows.length,
      powerupCodes,
      powerups,
      slots: slotRows,
      knownDefaults: {
        powerupCodes: DEFAULT_POWERUP_CODES,
        slotCodes: DEFAULT_POWERUP_SLOT_CODES,
      },
    };
  }

  async controlEvents(params: ControlEventsParams = {}): Promise<unknown> {
    const operation = params.operation || 'status';
    const allowedOperations = new Set(['status', 'addListener', 'removeListener']);
    if (!allowedOperations.has(operation)) {
      throw new Error(`Unsupported event operation: ${operation}`);
    }

    const valueDepth = this.clampLimit(params.valueDepth, 4, 8);
    const maxRecentEvents = this.clampLimit(params.maxRecentEvents, 5, 20);
    const before = await this.eventStatus(valueDepth, maxRecentEvents);
    if (operation === 'status') {
      return {
        success: true,
        readOnly: true,
        dryRun: true,
        mutationApplied: false,
        mode: 'control_events',
        pluginVersion: '2.58.0',
        operation,
        before,
      };
    }

    const requiredString = (value: unknown, fieldName: string): string => {
      const text = typeof value === 'string' ? value.trim() : '';
      if (!text) throw new Error(`control_events ${operation} requires ${fieldName}.`);
      return text;
    };
    const eventId = requiredString(params.eventId, 'eventId');
    const listenerKey = typeof params.listenerKey === 'string' && params.listenerKey.trim()
      ? params.listenerKey.trim()
      : 'mcp-bridge';
    const listenerId = this.eventListenerId(eventId, listenerKey);
    const plannedCall = {
      namespace: 'event',
      method: operation === 'addListener' ? 'addListener' : 'removeListener',
      args: operation === 'addListener'
        ? [eventId, listenerKey, '<generatedCallback>']
        : [eventId, listenerKey, params.allowUntracked === true ? '<optionalCallbackOmitted>' : '<trackedCallback>'],
    };
    const confirmationText = 'CONTROL_EVENTS';

    if (params.dryRun === true || params.confirm !== confirmationText) {
      return {
        success: false,
        requiresConfirmation: params.dryRun === true ? false : true,
        confirmationText,
        readOnly: params.dryRun === true,
        dryRun: params.dryRun === true,
        mutationApplied: false,
        mode: 'control_events',
        pluginVersion: '2.58.0',
        operation,
        reason: params.dryRun === true
          ? 'Dry run only; event listener action was not executed.'
          : 'Confirmation text is required before adding or removing RemNote event listeners.',
        plannedCall,
        before,
      };
    }

    const eventApi = (this.plugin as any).event;
    let success = false;
    let mutationApplied = false;
    let error: string | undefined;
    let alreadyRegistered = false;
    let removedTracked = false;
    try {
      if (operation === 'addListener') {
        const existing = this.eventListeners.get(listenerId);
        if (existing) {
          alreadyRegistered = true;
          success = true;
        } else {
          const callback = (event: unknown) => this.recordPluginEvent(listenerId, event, valueDepth);
          eventApi.addListener(eventId, listenerKey, callback);
          this.eventListeners.set(listenerId, {
            eventId,
            listenerKey,
            callback,
            registeredAt: Date.now(),
            eventCount: 0,
            recentEvents: [],
          });
          success = true;
          mutationApplied = true;
        }
      } else {
        const existing = this.eventListeners.get(listenerId);
        if (existing) {
          eventApi.removeListener(eventId, listenerKey, existing.callback);
          this.eventListeners.delete(listenerId);
          success = true;
          mutationApplied = true;
          removedTracked = true;
        } else if (params.allowUntracked === true) {
          eventApi.removeListener(eventId, listenerKey);
          success = true;
          mutationApplied = true;
        } else {
          throw new Error('No tracked event listener matched eventId/listenerKey; pass allowUntracked=true to call removeListener without a callback.');
        }
      }
    } catch (err) {
      error = err instanceof Error ? err.message : String(err);
    }

    const after = await this.eventStatus(valueDepth, maxRecentEvents);
    return {
      success,
      readOnly: false,
      dryRun: false,
      mutationApplied,
      mode: 'control_events',
      pluginVersion: '2.58.0',
      operation,
      plannedCall,
      listenerId,
      eventId,
      listenerKey,
      alreadyRegistered,
      removedTracked,
      ...(error ? { error } : {}),
      before,
      after,
    };
  }

  async controlReader(params: ControlReaderParams = {}): Promise<unknown> {
    const operation = params.operation || 'status';
    const allowedOperations = new Set(['status', 'addHighlight']);
    if (!allowedOperations.has(operation)) {
      throw new Error(`Unsupported reader operation: ${operation}`);
    }

    const valueDepth = this.clampLimit(params.valueDepth, 4, 8);
    const capabilities = {
      namespace: 'reader',
      supportedOperations: ['status', 'addHighlight'],
      requiresActiveReader: operation === 'addHighlight',
      notes: [
        'ReaderNamespace.addHighlight depends on the active PDF/Web Reader selection in RemNote.',
        'The bridge never calls addHighlight without confirm=CONTROL_READER unless dryRun=true.',
      ],
    };
    if (operation === 'status') {
      return {
        success: true,
        readOnly: true,
        dryRun: true,
        mutationApplied: false,
        mode: 'control_reader',
        pluginVersion: '2.58.0',
        operation,
        capabilities,
      };
    }

    const plannedCall = {
      namespace: 'reader',
      method: 'addHighlight',
      args: [],
    };
    const confirmationText = 'CONTROL_READER';
    if (params.dryRun === true || params.confirm !== confirmationText) {
      return {
        success: false,
        requiresConfirmation: params.dryRun === true ? false : true,
        confirmationText,
        readOnly: params.dryRun === true,
        dryRun: params.dryRun === true,
        mutationApplied: false,
        mode: 'control_reader',
        pluginVersion: '2.58.0',
        operation,
        reason: params.dryRun === true
          ? 'Dry run only; no reader highlight was created.'
          : 'Confirmation text is required before creating a highlight in the active reader.',
        plannedCall,
        capabilities,
      };
    }

    let highlight: unknown;
    let success = false;
    let error: string | undefined;
    try {
      highlight = await (this.plugin as any).reader.addHighlight();
      success = highlight !== undefined && highlight !== null;
    } catch (err) {
      error = err instanceof Error ? err.message : String(err);
    }

    let summary: unknown;
    if (success && params.includeSummary !== false) {
      try {
        summary = await this.getRemSummary(highlight as PluginRem, { includeTypeFlags: true, includePowerups: true });
      } catch (err) {
        summary = { error: err instanceof Error ? err.message : String(err) };
      }
    }

    return {
      success,
      readOnly: false,
      dryRun: false,
      mutationApplied: success,
      mode: 'control_reader',
      pluginVersion: '2.58.0',
      operation,
      plannedCall,
      highlight: await this.serializeForBridge(highlight, valueDepth),
      ...(summary !== undefined ? { summary } : {}),
      ...(error ? { error } : {}),
      ...(success ? {} : { reason: error || 'ReaderNamespace.addHighlight returned no highlight. An active PDF/Web Reader selection may be required.' }),
    };
  }

  async controlScheduler(params: ControlSchedulerParams = {}): Promise<unknown> {
    const operation = params.operation || 'status';
    const allowedOperations = new Set(['status', 'registerCustomScheduler']);
    if (!allowedOperations.has(operation)) {
      throw new Error(`Unsupported scheduler operation: ${operation}`);
    }

    const valueDepth = this.clampLimit(params.valueDepth, 4, 8);
    const capabilities = {
      namespace: 'scheduler',
      supportedOperations: ['status', 'registerCustomScheduler'],
      notes: [
        'SchedulerNamespace.registerCustomScheduler changes plugin runtime scheduling surface.',
        'Use dryRun=true first; live registration requires confirm=CONTROL_SCHEDULER.',
      ],
    };
    if (operation === 'status') {
      return {
        success: true,
        readOnly: true,
        dryRun: true,
        mutationApplied: false,
        mode: 'control_scheduler',
        pluginVersion: '2.58.0',
        operation,
        capabilities,
      };
    }

    const name = typeof params.name === 'string' ? params.name.trim() : '';
    if (!name) {
      throw new Error('control_scheduler registerCustomScheduler requires name.');
    }
    if (name.length > 120) {
      throw new Error('control_scheduler registerCustomScheduler name is too long.');
    }
    const parameters = this.normalizeSchedulerParameters(params.parameters);
    const plannedCall = {
      namespace: 'scheduler',
      method: 'registerCustomScheduler',
      args: [name, '<parameters>'],
      parameterCount: parameters.length,
    };
    const confirmationText = 'CONTROL_SCHEDULER';

    if (params.dryRun === true || params.confirm !== confirmationText) {
      return {
        success: false,
        requiresConfirmation: params.dryRun === true ? false : true,
        confirmationText,
        readOnly: params.dryRun === true,
        dryRun: params.dryRun === true,
        mutationApplied: false,
        mode: 'control_scheduler',
        pluginVersion: '2.58.0',
        operation,
        name,
        reason: params.dryRun === true
          ? 'Dry run only; custom scheduler was not registered.'
          : 'Confirmation text is required before registering a custom scheduler.',
        plannedCall,
        parameters: await this.serializeForBridge(parameters, valueDepth),
        capabilities,
      };
    }

    let result: unknown;
    let success = false;
    let error: string | undefined;
    try {
      result = await (this.plugin as any).scheduler.registerCustomScheduler(name, parameters);
      success = true;
    } catch (err) {
      error = err instanceof Error ? err.message : String(err);
    }

    return {
      success,
      readOnly: false,
      dryRun: false,
      mutationApplied: success,
      mode: 'control_scheduler',
      pluginVersion: '2.58.0',
      operation,
      name,
      plannedCall,
      parameters: await this.serializeForBridge(parameters, valueDepth),
      result: await this.serializeForBridge(result, valueDepth),
      ...(error ? { error } : {}),
    };
  }

  async inspectRemObjectState(params: InspectRemObjectStateParams): Promise<unknown> {
    const rem = await this.plugin.rem.findOne(params.remId);
    if (!rem) {
      throw new Error(`Rem not found: ${params.remId}`);
    }

    const valueDepth = this.clampLimit(params.valueDepth, 4, 8);
    const containerLimit = this.clampLimit(params.containerLimit, 10, 50);
    const portalId = typeof params.portalId === 'string' && params.portalId.trim()
      ? params.portalId.trim()
      : undefined;
    const summary = await this.getRemSummary(rem);
    const fields: Record<string, unknown> = {
      identity: summary,
      type: {
        getType: await this.captureSdkRead(() => rem.getType(), valueDepth),
        getSchemaVersion: await this.captureSdkRead(() => rem.getSchemaVersion(), valueDepth),
      },
      flags: {
        isDocument: await this.captureSdkRead(() => rem.isDocument(), valueDepth),
        isFolder: await this.captureSdkRead(() => rem.isFolder(), valueDepth),
        isTable: await this.captureSdkRead(() => rem.isTable(), valueDepth),
        isListItem: await this.captureSdkRead(() => rem.isListItem(), valueDepth),
        isCardItem: await this.captureSdkRead(() => rem.isCardItem(), valueDepth),
        isQuote: await this.captureSdkRead(() => rem.isQuote(), valueDepth),
        isCode: await this.captureSdkRead(() => rem.isCode(), valueDepth),
        isTodo: await this.captureSdkRead(() => rem.isTodo(), valueDepth),
        isSlot: await this.captureSdkRead(() => rem.isSlot(), valueDepth),
        isProperty: await this.captureSdkRead(() => rem.isProperty(), valueDepth),
        isPowerup: await this.captureSdkRead(() => rem.isPowerup(), valueDepth),
        isPowerupEnum: await this.captureSdkRead(() => rem.isPowerupEnum(), valueDepth),
        isPowerupSlot: await this.captureSdkRead(() => rem.isPowerupSlot(), valueDepth),
        isPowerupProperty: await this.captureSdkRead(() => rem.isPowerupProperty(), valueDepth),
        isPowerupPropertyListItem: await this.captureSdkRead(() => rem.isPowerupPropertyListItem(), valueDepth),
      },
      formatting: {
        getFontSize: await this.captureSdkRead(() => rem.getFontSize(), valueDepth),
        getHighlightColor: await this.captureSdkRead(() => rem.getHighlightColor(), valueDepth),
      },
      todo: {
        getTodoStatus: await this.captureSdkRead(() => rem.getTodoStatus(), valueDepth),
      },
      practice: {
        getEnablePractice: await this.captureSdkRead(() => rem.getEnablePractice(), valueDepth),
        getPracticeDirection: await this.captureSdkRead(() => rem.getPracticeDirection(), valueDepth),
        getLastPracticed: await this.captureSdkRead(() => rem.getLastPracticed(), valueDepth),
        getLastTimeMovedTo: await this.captureSdkRead(() => rem.getLastTimeMovedTo(), valueDepth),
        embeddedQueueViewMode: await this.captureSdkRead(() => rem.embeddedQueueViewMode(), valueDepth),
      },
      position: {
        positionAmongstSiblings: await this.captureSdkRead(() => rem.positionAmongstSiblings(portalId), valueDepth),
        positionAmongstVisibleSiblings: await this.captureSdkRead(() => rem.positionAmongstVisibleSiblings(portalId), valueDepth),
        timesSelectedInSearch: await this.captureSdkRead(() => rem.timesSelectedInSearch(), valueDepth),
      },
      portal: {
        portalId: portalId ?? null,
        getPortalType: await this.captureSdkRead(() => rem.getPortalType(), valueDepth),
        isCollapsed: portalId
          ? await this.captureSdkRead(() => rem.isCollapsed(portalId), valueDepth)
          : { ok: false, error: 'portalId is required for isCollapsed.' },
        getHiddenExplicitlyIncludedState: await this.captureSdkRead(() => rem.getHiddenExplicitlyIncludedState(portalId), valueDepth),
      },
    };

    if (params.includePowerups !== false) {
      const powerupCodes = this.normalizeStringArray(params.powerupCodes, DEFAULT_POWERUP_CODES, 64);
      const hasPowerup: Record<string, unknown> = {};
      for (const code of powerupCodes) {
        hasPowerup[code] = await this.captureSdkRead(() => rem.hasPowerup(code), valueDepth);
      }
      fields.powerups = {
        activePowerups: await this.getActivePowerupCodes(rem, powerupCodes),
        hasPowerup,
      };
    }

    if (params.includePowerupProperties && params.powerupSlotsByCode && typeof params.powerupSlotsByCode === 'object') {
      const powerupProperties: Record<string, unknown> = {};
      let inspected = 0;
      for (const [powerupCode, slotCodes] of Object.entries(params.powerupSlotsByCode)) {
        const cleanPowerupCode = powerupCode.trim();
        if (!cleanPowerupCode) continue;
        for (const slotCode of this.normalizeStringArray(slotCodes, [], 20)) {
          if (inspected >= 40) break;
          const key = `${cleanPowerupCode}.${slotCode}`;
          powerupProperties[key] = {
            asRem: await this.captureSdkRead(() => rem.getPowerupPropertyAsRem(cleanPowerupCode as any, slotCode as any), valueDepth),
            asRichText: await this.captureSdkRead(() => rem.getPowerupPropertyAsRichText(cleanPowerupCode as any, slotCode as any), valueDepth),
          };
          inspected += 1;
        }
        if (inspected >= 40) break;
      }
      fields.powerupProperties = powerupProperties;
    }

    if (params.includeContainerLists) {
      fields.containerLists = {
        allRemInFolderQueue: await this.captureSdkRead(
          async () => this.summarizeRemArray(await rem.allRemInFolderQueue(), containerLimit),
          valueDepth
        ),
        allRemInDocumentOrPortal: await this.captureSdkRead(
          async () => this.summarizeRemArray(await rem.allRemInDocumentOrPortal(), containerLimit),
          valueDepth
        ),
        portalsAndDocumentsIn: await this.captureSdkRead(
          async () => this.summarizeRemArray(await rem.portalsAndDocumentsIn(), containerLimit),
          valueDepth
        ),
      };
    }

    if (params.includeRelations) {
      fields.relations = {
        remsBeingReferenced: await this.captureSdkRead(
          async () => this.summarizeRemArray(await rem.remsBeingReferenced(), containerLimit),
          valueDepth
        ),
        remsReferencingThis: await this.captureSdkRead(
          async () => this.summarizeRemArray(await rem.remsReferencingThis(), containerLimit),
          valueDepth
        ),
      };
    }

    return {
      readOnly: true,
      mutationApplied: false,
      mode: 'inspect_rem_object_state',
      pluginVersion: '2.58.0',
      remId: rem._id,
      title: summary.title,
      fields,
    };
  }

  async inspectRemGraphContext(params: InspectRemGraphContextParams): Promise<unknown> {
    const rem = await this.plugin.rem.findOne(params.remId);
    if (!rem) {
      throw new Error(`Rem not found: ${params.remId}`);
    }

    const valueDepth = this.clampLimit(params.valueDepth, 4, 8);
    const limit = this.clampLimit(params.limit, 10, 100);
    const portalId = typeof params.portalId === 'string' && params.portalId.trim()
      ? params.portalId.trim()
      : undefined;
    const summary = await this.getRemSummary(rem);
    const fields: Record<string, unknown> = {
      identity: summary,
      location: {
        parent: await this.captureSdkRead(async () => {
          const parent = await rem.getParentRem();
          return parent ? this.getRemSummary(parent) : null;
        }, valueDepth),
        children: await this.captureSdkRead(
          async () => this.summarizeRemArray(await rem.getChildrenRem(), limit),
          valueDepth
        ),
        portalsAndDocumentsIn: await this.captureSdkRead(
          async () => this.summarizeRemArray(await rem.portalsAndDocumentsIn(), limit),
          valueDepth
        ),
      },
    };

    if (params.includeSiblings !== false) {
      fields.siblings = {
        siblingRem: await this.captureSdkRead(
          async () => this.summarizeRemArray(await rem.siblingRem(), limit),
          valueDepth
        ),
        visibleSiblingRem: await this.captureSdkRead(
          async () => this.summarizeRemArray(await rem.visibleSiblingRem(portalId), limit),
          valueDepth
        ),
      };
    }

    if (params.includeTagContext !== false) {
      fields.tagContext = {
        taggedRem: await this.captureSdkRead(
          async () => this.summarizeRemArray(await rem.taggedRem(), limit),
          valueDepth
        ),
        ancestorTagRem: await this.captureSdkRead(
          async () => this.summarizeRemArray(await rem.ancestorTagRem(), limit),
          valueDepth
        ),
        descendantTagRem: await this.captureSdkRead(
          async () => this.summarizeRemArray(await rem.descendantTagRem(), limit),
          valueDepth
        ),
      };
    }

    if (params.includeReferences !== false || params.includeDeepReferences) {
      fields.references = {
        remsBeingReferenced: params.includeReferences !== false
          ? await this.captureSdkRead(
            async () => this.summarizeRemArray(await rem.remsBeingReferenced(), limit),
            valueDepth
          )
          : { ok: false, error: 'includeReferences=false' },
        remsReferencingThis: params.includeReferences !== false
          ? await this.captureSdkRead(
            async () => this.summarizeRemArray(await rem.remsReferencingThis(), limit),
            valueDepth
          )
          : { ok: false, error: 'includeReferences=false' },
        deepRemsBeingReferenced: params.includeDeepReferences
          ? await this.captureSdkRead(
            async () => this.summarizeRemArray(await rem.deepRemsBeingReferenced(), limit),
            valueDepth
          )
          : { ok: false, error: 'Pass includeDeepReferences=true to inspect transitive outgoing references.' },
      };
    }

    if (params.includeContainers) {
      fields.containers = {
        allRemInFolderQueue: await this.captureSdkRead(
          async () => this.summarizeRemArray(await rem.allRemInFolderQueue(), limit),
          valueDepth
        ),
        allRemInDocumentOrPortal: await this.captureSdkRead(
          async () => this.summarizeRemArray(await rem.allRemInDocumentOrPortal(), limit),
          valueDepth
        ),
        getDescendants: await this.captureSdkRead(
          async () => this.summarizeRemArray(await rem.getDescendants(), limit),
          valueDepth
        ),
      };
    }

    return {
      readOnly: true,
      mutationApplied: false,
      mode: 'inspect_rem_graph_context',
      pluginVersion: '2.58.0',
      remId: rem._id,
      title: summary.title,
      portalId: portalId ?? null,
      limit,
      fields,
    };
  }

  async controlRemObjectState(params: ControlRemObjectStateParams): Promise<unknown> {
    const operation = params.operation || 'status';
    const allowedOperations = new Set([
      'status',
      'setListItem',
      'setCardItem',
      'setQuote',
      'setCode',
      'setTodo',
      'setTodoStatus',
      'setSlot',
      'setProperty',
      'setCollapsed',
      'setHiddenExplicitlyIncludedState',
      'expand',
      'collapse',
      'openRemInContext',
      'scrollToReaderHighlight',
      'copyReferenceToClipboard',
      'copyTagReferenceToClipboard',
      'copyPortalReferenceToClipboard',
    ]);
    if (!allowedOperations.has(operation)) {
      throw new Error(`Unsupported RemObject state operation: ${operation}`);
    }

    const rem = await this.plugin.rem.findOne(params.remId);
    if (!rem) {
      throw new Error(`Rem not found: ${params.remId}`);
    }

    const valueDepth = this.clampLimit(params.valueDepth, 4, 8);
    const before = await this.inspectRemObjectState({
      ...params,
      valueDepth,
      includeContainerLists: false,
      includeRelations: false,
      includePowerupProperties: false,
    });
    if (operation === 'status') {
      return {
        success: true,
        readOnly: true,
        dryRun: true,
        mutationApplied: false,
        mode: 'control_rem_object_state',
        pluginVersion: '2.58.0',
        operation,
        before,
      };
    }

    const confirmationText = 'CONTROL_REM_OBJECT_STATE';
    const portalId = typeof params.portalId === 'string' && params.portalId.trim()
      ? params.portalId.trim()
      : undefined;
    const booleanValue = (): boolean => {
      if (typeof params.value === 'boolean') return params.value;
      if (typeof params.value === 'string') {
        const normalized = params.value.trim().toLocaleLowerCase('en-US');
        if (['true', '1', 'yes', 'on'].includes(normalized)) return true;
        if (['false', '0', 'no', 'off'].includes(normalized)) return false;
      }
      throw new Error(`control_rem_object_state ${operation} requires boolean value.`);
    };
    const todoStatus = (): 'Finished' | 'Unfinished' => {
      const raw = (params.todoStatus || (typeof params.value === 'string' ? params.value : '')).trim();
      if (raw === 'Finished' || raw.toLocaleLowerCase('en-US') === 'finished') return 'Finished';
      if (raw === 'Unfinished' || raw.toLocaleLowerCase('en-US') === 'unfinished') return 'Unfinished';
      throw new Error('control_rem_object_state setTodoStatus requires todoStatus=Finished|Unfinished.');
    };
    const hiddenState = (): 'hidden' | 'included' | 'none' => {
      const raw = (params.hiddenState || (typeof params.value === 'string' ? params.value : '')).trim().toLocaleLowerCase('en-US');
      if (raw === 'hidden' || raw === 'included' || raw === 'none') return raw;
      throw new Error('control_rem_object_state setHiddenExplicitlyIncludedState requires hiddenState=hidden|included|none.');
    };

    const plannedCall: Record<string, unknown> = {
      target: 'RemObject',
      remId: rem._id,
      method: operation,
      args: [],
    };
    let execute: () => Promise<unknown>;

    if (operation === 'setListItem') {
      const value = booleanValue();
      plannedCall.method = 'setIsListItem';
      plannedCall.args = [value];
      execute = () => rem.setIsListItem(value);
    } else if (operation === 'setCardItem') {
      const value = booleanValue();
      plannedCall.method = 'setIsCardItem';
      plannedCall.args = [value];
      execute = () => rem.setIsCardItem(value);
    } else if (operation === 'setQuote') {
      const value = booleanValue();
      plannedCall.method = 'setIsQuote';
      plannedCall.args = [value];
      execute = () => rem.setIsQuote(value);
    } else if (operation === 'setCode') {
      const value = booleanValue();
      plannedCall.method = 'setIsCode';
      plannedCall.args = [value];
      execute = () => rem.setIsCode(value);
    } else if (operation === 'setTodo') {
      const value = booleanValue();
      plannedCall.method = 'setIsTodo';
      plannedCall.args = [value];
      execute = () => rem.setIsTodo(value);
    } else if (operation === 'setTodoStatus') {
      const value = todoStatus();
      plannedCall.method = 'setTodoStatus';
      plannedCall.args = [value];
      execute = () => rem.setTodoStatus(value);
    } else if (operation === 'setSlot') {
      const value = booleanValue();
      plannedCall.method = 'setIsSlot';
      plannedCall.args = [value];
      execute = () => rem.setIsSlot(value);
    } else if (operation === 'setProperty') {
      const value = booleanValue();
      plannedCall.method = 'setIsProperty';
      plannedCall.args = [value];
      execute = () => rem.setIsProperty(value);
    } else if (operation === 'setCollapsed') {
      if (!portalId) throw new Error('control_rem_object_state setCollapsed requires portalId.');
      const value = booleanValue();
      plannedCall.method = 'setIsCollapsed';
      plannedCall.args = [value, portalId];
      execute = () => rem.setIsCollapsed(value, portalId);
    } else if (operation === 'setHiddenExplicitlyIncludedState') {
      const value = hiddenState();
      plannedCall.method = 'setHiddenExplicitlyIncludedState';
      plannedCall.args = [value, portalId ?? null];
      execute = () => rem.setHiddenExplicitlyIncludedState(value, portalId);
    } else if (operation === 'expand') {
      const recurse = params.recurse === true;
      plannedCall.method = 'expand';
      plannedCall.args = [portalId ?? null, recurse];
      execute = () => rem.expand(portalId, recurse);
    } else if (operation === 'collapse') {
      plannedCall.method = 'collapse';
      plannedCall.args = [portalId ?? null];
      execute = () => rem.collapse(portalId);
    } else if (operation === 'openRemInContext') {
      plannedCall.method = 'openRemInContext';
      plannedCall.args = [portalId ?? null];
      execute = () => rem.openRemInContext(portalId);
    } else if (operation === 'scrollToReaderHighlight') {
      plannedCall.method = 'scrollToReaderHighlight';
      execute = () => rem.scrollToReaderHighlight();
    } else if (operation === 'copyReferenceToClipboard') {
      plannedCall.method = 'copyReferenceToClipboard';
      execute = () => rem.copyReferenceToClipboard();
    } else if (operation === 'copyTagReferenceToClipboard') {
      plannedCall.method = 'copyTagReferenceToClipboard';
      execute = () => rem.copyTagReferenceToClipboard();
    } else if (operation === 'copyPortalReferenceToClipboard') {
      plannedCall.method = 'copyPortalReferenceToClipboard';
      execute = () => rem.copyPortalReferenceToClipboard();
    } else {
      throw new Error(`Unsupported RemObject state operation: ${operation}`);
    }

    if (params.dryRun === true || params.confirm !== confirmationText) {
      return {
        success: false,
        requiresConfirmation: params.dryRun === true ? false : true,
        confirmationText,
        readOnly: params.dryRun === true,
        dryRun: params.dryRun === true,
        mutationApplied: false,
        mode: 'control_rem_object_state',
        pluginVersion: '2.58.0',
        operation,
        reason: params.dryRun === true
          ? 'Dry run only; RemObject state action was not executed.'
          : 'Confirmation text is required before controlling RemObject state or UI side effects.',
        plannedCall,
        before,
      };
    }

    let result: unknown;
    let success = false;
    let error: string | undefined;
    try {
      result = await execute();
      success = true;
    } catch (err) {
      error = err instanceof Error ? err.message : String(err);
    }

    const after = await this.inspectRemObjectState({
      ...params,
      valueDepth,
      includeContainerLists: false,
      includeRelations: false,
      includePowerupProperties: false,
    });
    return {
      success,
      readOnly: false,
      dryRun: false,
      mutationApplied: success,
      mode: 'control_rem_object_state',
      pluginVersion: '2.58.0',
      operation,
      plannedCall,
      result: await this.serializeForBridge(result, valueDepth),
      ...(error ? { error } : {}),
      before,
      after,
    };
  }

  async controlRemStructure(params: ControlRemStructureParams): Promise<unknown> {
    const operation = params.operation || 'status';
    const allowedOperations = new Set(['status', 'indent', 'outdent', 'setType', 'merge', 'mergeAndSetAlias']);
    if (!allowedOperations.has(operation)) {
      throw new Error(`Unsupported RemObject structure operation: ${operation}`);
    }

    const rem = await this.plugin.rem.findOne(params.remId);
    if (!rem) {
      throw new Error(`Rem not found: ${params.remId}`);
    }

    const valueDepth = this.clampLimit(params.valueDepth, 4, 8);
    const portalId = typeof params.portalId === 'string' && params.portalId.trim()
      ? params.portalId.trim()
      : undefined;
    const includeBeforeAfter = params.includeBeforeAfter !== false;
    const before = includeBeforeAfter
      ? await this.inspectRemGraphContext({
        remId: rem._id,
        portalId,
        includeDeepReferences: false,
        includeContainers: false,
        limit: 10,
        valueDepth,
      })
      : undefined;

    if (operation === 'status') {
      return {
        success: true,
        readOnly: true,
        dryRun: true,
        mutationApplied: false,
        mode: 'control_rem_structure',
        pluginVersion: '2.58.0',
        operation,
        before,
      };
    }

    const confirmationText = 'CONTROL_REM_STRUCTURE';
    const destructiveConfirmationText = 'MERGE_REM';
    const plannedCall: Record<string, unknown> = {
      target: 'RemObject',
      remId: rem._id,
      method: operation,
      args: [],
    };
    let execute: () => Promise<unknown> = async () => undefined;
    const destructive = operation === 'merge' || operation === 'mergeAndSetAlias';

    if (operation === 'indent') {
      plannedCall.method = 'indent';
      plannedCall.args = [portalId ?? null];
      execute = () => rem.indent(portalId);
    } else if (operation === 'outdent') {
      plannedCall.method = 'outdent';
      plannedCall.args = [portalId ?? null];
      execute = () => rem.outdent(portalId);
    } else if (operation === 'setType') {
      const type = this.parseSetRemType(params.remType);
      plannedCall.method = 'setType';
      plannedCall.args = [type];
      plannedCall.remType = params.remType ?? type;
      execute = () => rem.setType(type);
    } else if (operation === 'merge') {
      const targetRemId = typeof params.targetRemId === 'string' ? params.targetRemId.trim() : '';
      if (!targetRemId) throw new Error('control_rem_structure merge requires targetRemId.');
      const target = await this.plugin.rem.findOne(targetRemId);
      if (!target) throw new Error(`Target Rem not found: ${targetRemId}`);
      plannedCall.method = 'merge';
      plannedCall.args = [targetRemId];
      plannedCall.targetRemId = targetRemId;
      plannedCall.destructive = true;
      plannedCall.target = await this.getRemSummary(target);
      execute = () => rem.merge(targetRemId);
    } else if (operation === 'mergeAndSetAlias') {
      const targetRemId = typeof params.targetRemId === 'string' ? params.targetRemId.trim() : '';
      if (!targetRemId) throw new Error('control_rem_structure mergeAndSetAlias requires targetRemId.');
      const target = await this.plugin.rem.findOne(targetRemId);
      if (!target) throw new Error(`Target Rem not found: ${targetRemId}`);
      plannedCall.method = 'mergeAndSetAlias';
      plannedCall.args = [targetRemId];
      plannedCall.targetRemId = targetRemId;
      plannedCall.destructive = true;
      plannedCall.target = await this.getRemSummary(target);
      execute = () => rem.mergeAndSetAlias(targetRemId);
    }

    if (params.dryRun === true || params.confirm !== confirmationText) {
      return {
        success: false,
        requiresConfirmation: params.dryRun === true ? false : true,
        confirmationText,
        readOnly: params.dryRun === true,
        dryRun: params.dryRun === true,
        mutationApplied: false,
        mode: 'control_rem_structure',
        pluginVersion: '2.58.0',
        operation,
        reason: params.dryRun === true
          ? 'Dry run only; RemObject structure action was not executed.'
          : 'Confirmation text is required before controlling RemObject structure.',
        plannedCall,
        before,
      };
    }

    if (destructive && (params.allowDestructive !== true || params.destructiveConfirm !== destructiveConfirmationText)) {
      return {
        success: false,
        requiresConfirmation: true,
        confirmationText,
        destructiveConfirmationText,
        readOnly: true,
        dryRun: false,
        mutationApplied: false,
        mode: 'control_rem_structure',
        pluginVersion: '2.58.0',
        operation,
        reason: 'Merge operations are destructive and require allowDestructive=true plus destructiveConfirm=MERGE_REM.',
        plannedCall,
        before,
      };
    }

    let result: unknown;
    let success = false;
    let error: string | undefined;
    try {
      result = await execute();
      success = true;
    } catch (err) {
      error = err instanceof Error ? err.message : String(err);
    }

    const after = includeBeforeAfter
      ? await this.inspectRemGraphContext({
        remId: rem._id,
        portalId,
        includeDeepReferences: false,
        includeContainers: false,
        limit: 10,
        valueDepth,
      })
      : undefined;

    return {
      success,
      readOnly: false,
      dryRun: false,
      mutationApplied: success,
      mode: 'control_rem_structure',
      pluginVersion: '2.58.0',
      operation,
      plannedCall,
      result: await this.serializeForBridge(result, valueDepth),
      ...(error ? { error } : {}),
      before,
      after,
    };
  }

  async inspectFocusContext(params: InspectFocusContextParams = {}): Promise<unknown> {
    const valueDepth = this.clampLimit(params.valueDepth, 4, 8);
    const focus = (this.plugin as any).focus;
    const fields: Record<string, unknown> = {
      focusedRem: await this.captureSdkRead(() => focus.getFocusedRem(), valueDepth),
      focusedPortal: await this.captureSdkRead(() => focus.getFocusedPortal(), valueDepth),
    };

    return {
      readOnly: true,
      mutationApplied: false,
      mode: 'inspect_focus_context',
      pluginVersion: '2.58.0',
      fields,
    };
  }

  async richTextParseMarkdown(params: RichTextParseMarkdownParams): Promise<unknown> {
    const richText = await this.plugin.richText.parseFromMarkdown(params.markdown || '');
    return {
      readOnly: true,
      mutationApplied: false,
      mode: 'rich_text_parse_markdown',
      pluginVersion: '2.58.0',
      sourceLength: (params.markdown || '').length,
      ...(await this.summarizeRichText(richText, {
        includeHtml: params.includeHtml,
        includeMarkdown: params.includeMarkdown,
        includeString: params.includeString !== false,
        valueDepth: params.valueDepth,
      })),
    };
  }

  async richTextFormatRange(params: RichTextFormatRangeParams): Promise<unknown> {
    if (!params.format || typeof params.format !== 'string') {
      throw new Error('rich_text_format_range requires a RichText format name.');
    }
    const richText = await this.richTextFromParams(params);
    const lengthResult = await this.plugin.richText.length(richText);
    const start = Math.max(0, Math.min(Math.floor(params.start ?? 0), lengthResult));
    const end = Math.max(start, Math.min(Math.floor(params.end ?? lengthResult), lengthResult));
    const mode = params.mode || 'apply';
    let formatted: RichTextInterface;
    if (mode === 'remove') {
      formatted = await this.plugin.richText.removeTextFormatFromRange(richText, start, end, params.format as any);
    } else if (mode === 'toggle') {
      formatted = await this.plugin.richText.toggleTextFormatOnRange(richText, start, end, params.format as any);
    } else {
      formatted = await this.plugin.richText.applyTextFormatToRange(richText, start, end, params.format as any);
    }

    return {
      readOnly: true,
      mutationApplied: false,
      mode: 'rich_text_format_range',
      pluginVersion: '2.58.0',
      operation: {
        mode,
        format: params.format,
        start,
        end,
        sourceLength: lengthResult,
      },
      ...(await this.summarizeRichText(formatted, {
        includeHtml: params.includeHtml,
        includeMarkdown: params.includeMarkdown,
        includeString: params.includeString !== false,
        valueDepth: params.valueDepth,
      })),
    };
  }

  async richTextInspect(params: RichTextInspectParams): Promise<unknown> {
    const richText = await this.richTextFromParams(params);
    const valueDepth = this.clampLimit(params.valueDepth, 5, 8);
    const fields: Record<string, unknown> = {
      indexOfElementAtStart: await this.captureSdkRead(() => this.plugin.richText.indexOfElementAt(richText, Math.max(0, Math.floor(params.start ?? 0))), valueDepth),
      normalized: await this.captureSdkRead(() => this.plugin.richText.normalize(richText), valueDepth),
      trimmed: await this.captureSdkRead(() => this.plugin.richText.trim(richText), valueDepth),
    };
    if (typeof params.character === 'string' && params.character.length > 0) {
      fields.indexOf = await this.captureSdkRead(() => this.plugin.richText.indexOf(richText, params.character as string, Math.max(0, Math.floor(params.start ?? 0))), valueDepth);
      fields.charAt = await this.captureSdkRead(() => this.plugin.richText.charAt(richText, Math.max(0, Math.floor(params.start ?? 0))), valueDepth);
    }
    if (typeof params.start === 'number' || typeof params.end === 'number') {
      const lengthResult = await this.plugin.richText.length(richText);
      const start = Math.max(0, Math.min(Math.floor(params.start ?? 0), lengthResult));
      const end = typeof params.end === 'number'
        ? Math.max(start, Math.min(Math.floor(params.end), lengthResult))
        : undefined;
      fields.substring = await this.captureSdkRead(() => this.plugin.richText.substring(richText, start, end), valueDepth);
    }

    return {
      readOnly: true,
      mutationApplied: false,
      mode: 'rich_text_inspect',
      pluginVersion: '2.58.0',
      ...(await this.summarizeRichText(richText, {
        includeHtml: params.includeHtml,
        includeMarkdown: params.includeMarkdown,
        includeReferences: params.includeReferences !== false,
        includeString: true,
        valueDepth,
      })),
      fields,
    };
  }

  async richTextInsertHtml(params: RichTextInsertHtmlParams): Promise<unknown> {
    const remId = typeof params.remId === 'string' ? params.remId.trim() : '';
    if (!remId) {
      throw new Error('rich_text_insert_html requires remId.');
    }
    const html = typeof params.html === 'string' ? params.html : '';
    if (!html.trim()) {
      throw new Error('rich_text_insert_html requires non-empty html.');
    }
    const maxHtmlLength = this.clampLimit(params.maxHtmlLength, 20000, 200000);
    if (html.length > maxHtmlLength) {
      throw new Error(`rich_text_insert_html html length ${html.length} exceeds maxHtmlLength ${maxHtmlLength}.`);
    }

    const rem = await this.plugin.rem.findOne(remId);
    if (!rem) {
      throw new Error(`Rem not found for rich_text_insert_html: ${remId}`);
    }

    const valueDepth = this.clampLimit(params.valueDepth, 4, 8);
    const childLimit = this.clampLimit(params.childLimit, 20, 200);
    const includeBeforeAfter = params.includeBeforeAfter !== false;
    const safety = this.inspectHtmlImportSafety(html, params.allowUnsafeHtml === true);
    const plannedCall = {
      namespace: 'richText',
      method: 'parseAndInsertHtml',
      args: ['<html>', remId],
      htmlLength: html.length,
      childLimit,
    };
    const confirmationText = 'IMPORT_HTML_TO_REM';
    const before = includeBeforeAfter
      ? await this.getHtmlImportSnapshot(rem, childLimit, valueDepth)
      : undefined;

    if (safety.ok !== true) {
      return {
        success: false,
        error: 'unsafe_html_blocked',
        readOnly: true,
        dryRun: params.dryRun === true,
        mutationApplied: false,
        mode: 'rich_text_insert_html',
        pluginVersion: '2.58.0',
        remId,
        htmlLength: html.length,
        reason: 'HTML import preflight blocked potentially unsafe tags, event attributes, or URL protocols. Pass allowUnsafeHtml=true only after manual review.',
        safety,
        plannedCall,
        ...(before ? { before } : {}),
      };
    }

    if (params.dryRun === true || params.confirm !== confirmationText) {
      return {
        success: false,
        requiresConfirmation: params.dryRun === true ? false : true,
        confirmationText,
        readOnly: params.dryRun === true,
        dryRun: params.dryRun === true,
        mutationApplied: false,
        mode: 'rich_text_insert_html',
        pluginVersion: '2.58.0',
        remId,
        htmlLength: html.length,
        reason: params.dryRun === true
          ? 'Dry run only; HTML was not inserted into RemNote.'
          : 'Confirmation text is required before inserting parsed HTML into a Rem.',
        safety,
        plannedCall,
        ...(before ? { before } : {}),
      };
    }

    await this.plugin.richText.parseAndInsertHtml(html, rem);
    const refreshed = await this.plugin.rem.findOne(remId) || rem;
    const after = includeBeforeAfter
      ? await this.getHtmlImportSnapshot(refreshed, childLimit, valueDepth)
      : undefined;
    const beforeChildIds = new Set(this.getSnapshotChildIds(before));
    const createdChildIds = this.getSnapshotChildIds(after).filter((childId) => !beforeChildIds.has(childId));

    return {
      success: true,
      readOnly: false,
      dryRun: false,
      mutationApplied: true,
      mode: 'rich_text_insert_html',
      pluginVersion: '2.58.0',
      remId,
      htmlLength: html.length,
      safety,
      plannedCall,
      createdChildIds,
      createdChildCount: createdChildIds.length,
      ...(before ? { before } : {}),
      ...(after ? { after } : {}),
    };
  }

  async getCapabilityInspector(params: CapabilityInspectorParams = {}): Promise<unknown> {
    const sdkMethods = Array.from(SDK_REM_METHOD_ALLOWLIST).sort();
    const rawMethods = Array.from(RAW_REM_CALL_ALLOWLIST).sort();
    const namespaceAllowlist = Object.fromEntries(
      Object.entries(SDK_NAMESPACE_READ_ALLOWLIST).map(([namespace, methods]) => [namespace, Array.from(methods).sort()])
    );
    const actions = [...(params.actions || [])].sort();
    const actionSet = new Set(actions);

    const matrix = [
      { area: 'notes', status: 'supported', actions: ['create_note', 'create_link_rem', 'read_note', 'read_rem_full', 'inspect_rem_object_state', 'inspect_rem_graph_context', 'control_rem_object_state', 'control_rem_structure', 'probe_rem_ids', 'update_note', 'move_note', 'delete_note', 'overwrite_note_content', 'get_all_rems', 'export_vault_snapshot', 'safe_migration_plan', 'safe_migration_apply', 'safe_migration_audit_log', 'safe_migration_validate_rollback', 'safe_migration_apply_rollback'], note: 'Plain Rem, Markdown-backed Rem, confirmed Link Rem creation, RemObject state/graph inspection and confirmed state/structure/UI controls are exposed; destructive mutations remain typed, double-confirmed, or safe-migration gated.' },
      { area: 'tags', status: 'supported', actions: ['get_rem_tags', 'list_tagged_rems', 'export_tag_view', 'add_tag_by_id', 'remove_tag_by_id'] },
      { area: 'properties', status: 'partial', actions: ['create_property', 'get_property_info', 'set_tag_property_value'], note: 'Native property type setter is blocked by RemNote SDK 0.0.46.' },
      { area: 'templates', status: 'supported', actions: ['create_template', 'set_template_auto_apply', 'list_tag_templates', 'apply_template_to_rem', 'apply_tag_auto_template'] },
      { area: 'tables', status: 'partial', actions: ['create_table', 'list_table_rows', 'set_table_filter_raw'], note: 'Raw table filter accepts SDK SearchPortalQuery shape; native view configuration is UI-only.' },
      { area: 'flashcards_practice', status: 'supported', actions: ['create_flashcard', 'create_cloze_flashcard', 'update_flashcard_back', 'set_practice_state', 'export_practice_queue', 'export_card_catalog', 'read_card_full', 'control_card', 'control_practice_queue'], note: 'Practice Rem rows, SDK Card catalog/read paths, confirmed card remove/repetition updates, and live queue controls are exposed through typed dry-run and confirmation gates.' },
      { area: 'learning_inbox', status: 'supported', actions: ['export_learning_inbox', 'plan_learning_inbox_repairs', 'apply_learning_inbox_repairs'], note: 'Learning tag dashboard, dry-run repair plans, and confirmed property-only repair apply; card drafts remain suggestions.' },
      { area: 'graph', status: 'supported', actions: ['export_graph_edges', 'inspect_rem_graph_context', 'host_remnote_leveldb_graph_export', 'create_reference', 'create_portal', 'add_source_to_rem', 'remove_source_from_rem', 'add_rem_to_portal', 'remove_rem_from_portal', 'create_alias'] },
      { area: 'powerups', status: 'supported', actions: ['inspect_powerup_registry', 'inspect_built_in_powerups', 'inspect_native_icon_state', 'inspect_note_style', 'inspect_folder_state', 'add_powerup', 'remove_powerup', 'remove_powerup_v2', 'apply_native_emoji_icon', 'apply_callout_bullet_icon', 'set_document_pinned_state', 'set_folder_state'], note: 'Built-in and plugin powerup/slot Rems are readable through PowerupNamespace; RemObject powerup add/remove and selected visual/document/folder powerup property workflows have typed actions.' },
      { area: 'daily_docs', status: 'supported', actions: ['get_daily_doc', 'append_journal', 'export_daily_range'] },
      { area: 'app_control', status: 'supported', actions: ['inspect_app_context', 'control_app'], note: 'Operating system/platform/sync probes are readable; AppNamespace sync wait, transaction probe, toast, CSS/status-bar, widget/menu/command/callback, key capture, and powerup registration calls are exposed through typed dry-run and confirmation gates.' },
      { area: 'event_control', status: 'supported', actions: ['control_events'], note: 'Event listener status is readable; adding/removing generated RemNote event callbacks requires explicit confirmation and supports dry-run planned calls.' },
      { area: 'reader_control', status: 'supported', actions: ['control_reader'], note: 'ReaderNamespace.addHighlight is exposed as a typed dry-run and confirmation-gated action because it creates a highlight in the active PDF/Web Reader.' },
      { area: 'scheduler_control', status: 'supported', actions: ['control_scheduler'], note: 'SchedulerNamespace.registerCustomScheduler is exposed as a typed dry-run and confirmation-gated action because it changes plugin runtime scheduling surface.' },
      { area: 'rem_object_state', status: 'supported', actions: ['inspect_rem_object_state', 'control_rem_object_state'], note: 'RemObject type flags, formatting, todo, practice, portal/collapse, position, powerup, relation and container-list state can be read as one structured snapshot; selected state/UI side-effect methods use dry-run plus confirm=CONTROL_REM_OBJECT_STATE.' },
      { area: 'rem_object_graph_structure', status: 'supported', actions: ['inspect_rem_graph_context', 'control_rem_structure'], note: 'Sibling, visible sibling, hierarchical tag context, direct/deep reference, parent/child and container context are readable; indent/outdent/setType use confirm=CONTROL_REM_STRUCTURE, while merge operations also require allowDestructive=true and destructiveConfirm=MERGE_REM.' },
      { area: 'window_control', status: 'supported', actions: ['debug_window_context', 'control_window'], note: 'Window tree, pane, URL and Rem pane state are readable; focus, URL, tree, floating widget, widget pane/sidebar and key-capture operations use a typed confirmation gate with dry-run planned calls.' },
      { area: 'editor_control', status: 'supported', actions: ['inspect_editor_context', 'control_editor'], note: 'Active editor selection/text/caret state is readable; setText, insert, selection, caret, clipboard, delete, undo and redo operations use a typed confirmation gate with dry-run planned calls.' },
      { area: 'sdk_namespace_read', status: 'supported', actions: ['sdk_namespace_call', 'inspect_app_context', 'inspect_editor_context', 'inspect_queue_context', 'inspect_plugin_runtime', 'inspect_focus_context', 'inspect_powerup_registry', 'inspect_rem_object_state', 'inspect_rem_graph_context', 'export_card_catalog', 'read_card_full', 'control_app', 'control_plugin_runtime', 'control_practice_queue', 'control_card', 'control_editor', 'control_events', 'control_reader', 'control_scheduler', 'control_rem_object_state', 'control_rem_structure'], note: 'Read-only App/Window/Editor/Queue/Date/RichText/Storage/Settings/KnowledgeBase/Focus/Card/Powerup namespace calls are allowlisted; inspectors expose UI, editor selection, platform, queue, plugin runtime, knowledge base, focus, powerup, RemObject state/graph and card state, while app/plugin-runtime/editor/queue/card/event/reader/scheduler/RemObject mutations use typed confirmation gates.' },
      { area: 'plugin_runtime', status: 'supported', actions: ['inspect_plugin_runtime', 'control_plugin_runtime', 'control_app'], note: 'Bridge settings, known plugin storage keys and current knowledge base metadata are readable for MCP debugging; plugin storage writes, setting registration, widget popup/context reads, and messaging broadcast are available via dry-run and confirmation gates.' },
      { area: 'plugin_runtime_control', status: 'supported', actions: ['inspect_plugin_runtime', 'control_plugin_runtime'], note: 'Storage get/set, Settings get/register, Widget get/open/close, and Messaging broadcast are typed; read operations stay read-only and mutations require confirmation.' },
      { area: 'focus_context', status: 'supported', actions: ['inspect_focus_context'], note: 'Focused Rem and focused portal are readable through the SDK focus namespace without changing editor state.' },
      { area: 'rich_text', status: 'supported', actions: ['sdk_namespace_call', 'rich_text_parse_markdown', 'rich_text_format_range', 'rich_text_inspect', 'rich_text_insert_html'], note: 'Markdown parsing, range formatting, string/markdown/html/reference inspection, generic pure RichText namespace calls, and confirmed HTML-to-Rem import are exposed. HTML import has dry-run, preflight blocking, and explicit confirmation because it writes parsed Rems.' },
      { area: 'ui_view_configuration', status: 'partial', actions: ['open_note', 'inject_css', 'debug_window_context', 'control_window', 'inspect_app_context', 'control_app', 'inspect_editor_context', 'control_editor', 'sdk_namespace_call'], note: 'Open panes, focus, URL and editor selection are readable; Window/App UI registrations and editor selection/caret changes are confirmation-gated; tag page sort/view clicks still need UI automation when not exposed by SDK.' },
      { area: 'sdk_surface_audit', status: 'supported', actions: ['capability_inspector', 'sdk_gap_report', 'host_remnote_sdk_surface_gap_report'], note: 'Capability inspector exposes action/allowlist matrix; host SDK surface report reads local @remnote/plugin-sdk declaration files and action coverage to identify typed-action gaps.' },
      { area: 'vault_snapshot', status: 'supported', actions: ['export_vault_snapshot', 'host_remnote_vault_snapshot_export', 'host_remnote_vault_snapshot_export_partitioned', 'host_remnote_vault_export_catalog', 'host_remnote_vault_export_query', 'host_remnote_vault_export_field_profile', 'host_remnote_vault_export_schema_profile', 'host_remnote_vault_export_stats', 'host_remnote_vault_export_stats_aggregate', 'host_remnote_vault_quality_report', 'host_remnote_vault_export_graph', 'host_remnote_vault_export_graph_file', 'host_remnote_vault_graph_export_catalog', 'host_remnote_vault_graph_export_query', 'host_remnote_vault_export_diff'], note: 'Read-only, paginated SDK-visible vault snapshot with optional raw text, relation, property, and practice/card blocks; host actions write single-file or partitioned JSONL plus manifest into the local cache. Query and stats can use cursorMode/nextCursor for resumable pages, schema_profile maps field paths/types/samples, field_profile maps selected field value distributions and can reuse query/rem/tag/parent/time filters, stats_aggregate produces one merged inventory rollup with chunk/page summaries, quality_report separates export schema coverage from real missing timestamp/title/property/relation/practice signals and includes a read-only repairPlanPreview, and query/field/schema/stat/aggregate/quality/graph/streaming graph-file/diff can read all partition parts automatically when exportId/exportDir selects a partitioned export.' },
      { area: 'internal_database_read', status: 'partial', actions: ['indexeddb_inventory', 'indexeddb_read_store', 'host_remnote_db_inventory', 'host_remnote_db_doctor_scan', 'host_remnote_leveldb_snapshot_scan', 'host_remnote_leveldb_decode', 'host_remnote_leveldb_log_decode', 'host_remnote_leveldb_entity_index', 'host_remnote_leveldb_graph_export', 'host_remnote_leveldb_sdk_map', 'host_remnote_vault_snapshot_export', 'host_remnote_vault_snapshot_export_partitioned', 'host_remnote_vault_export_catalog', 'host_remnote_vault_export_query', 'host_remnote_vault_export_field_profile', 'host_remnote_vault_export_schema_profile', 'host_remnote_vault_export_stats', 'host_remnote_vault_export_stats_aggregate', 'host_remnote_vault_quality_report', 'host_remnote_vault_export_graph', 'host_remnote_vault_export_graph_file', 'host_remnote_vault_graph_export_catalog', 'host_remnote_vault_graph_export_query', 'host_remnote_vault_export_diff', 'probe_rem_ids'], note: 'IndexedDB inventory/store snapshots run in the plugin; host-side AppData LevelDB work uses copied read-only snapshots plus table/log key/value previews, heuristic entity indexes, SDK-enriched DB graph exports, one-call SDK reconciliation maps, DB Doctor scans, SDK Rem ID probes, and SDK-visible vault JSONL single-file/partitioned export catalog/query/field-profile/schema-profile/stat/stat-aggregate/quality-report/graph/graph-file/graph-catalog/graph-query/diff with all-part reads for partitioned exports.' },
      { area: 'internal_database_write', status: 'unsafe_internal_db', actions: [], note: 'Direct DB writes are intentionally not implemented; use SDK writes or read-only snapshots only.' },
      { area: 'doctor', status: 'supported', actions: ['remnote_doctor_scan', 'plan_remnote_doctor_repairs', 'apply_remnote_doctor_repairs', 'host_remnote_db_doctor_scan'], note: 'SDK Doctor scans can now produce safe migration repair plans and confirmed applies for missing dates plus explicitly allowed blank-child cleanup.' },
      { area: 'safe_migration', status: 'supported', actions: ['safe_migration_plan', 'safe_migration_apply', 'safe_migration_audit_log', 'safe_migration_validate_rollback', 'safe_migration_apply_rollback'], note: 'Plan is dry-run only; apply requires confirmation text and blocks high-risk/delete operations unless explicitly allowed. Successful applies write a compact audit record; rollback validation stays read-only and rollback apply needs separate confirmation.' },
    ].map((entry) => ({
      ...entry,
      implementedActions: entry.actions.filter((action) => actionSet.has(action)),
      missingActions: entry.actions.filter((action) => !actionSet.has(action)),
    }));

    return {
      pluginVersion: '2.58.0',
      sdkVersion: '0.0.46',
      actionCount: actions.length,
      actions,
      sdkRemMethodAllowlist: sdkMethods,
      rawRemMethodAllowlist: rawMethods,
      sdkNamespaceReadAllowlist: namespaceAllowlist,
      testCoverageStatus: {
        status: 'host_verified_available',
        hostAction: 'host_remnote_sdk_surface_gap_report',
        expectedTool: 'check_action_coverage.ps1 -FailOnUncovered',
        latestExpectedSummary: '150 action, 150 covered, 0 uncovered',
      },
      matrix,
      knownSdkBlocks: [
        {
          area: 'native_property_type_setter',
          status: 'blocked_by_sdk',
          reason: 'RemObject exposes getPropertyType(), but no supported SDK setter for native tag property types.',
        },
        {
          area: 'tag_view_sort_and_columns',
          status: 'needs_ui_automation',
          reason: 'RemNote tag page view configuration is not exposed as a Plugin SDK method.',
        },
        {
          area: 'internal_database_read',
          status: 'partial',
          reason: 'IndexedDB can be inventoried/read through browser readonly transactions; host-side LevelDB actions copy files to a snapshot before string forensics, SSTable key/value decode, log write-batch decode, heuristic entity indexing, SDK-enriched graph export, one-call SDK reconciliation, or DB Doctor scans. probe_rem_ids can verify candidate IDs through the SDK. Raw LevelDB mutation remains out of scope.',
        },
        {
          area: 'internal_database_write',
          status: 'unsafe_internal_db',
          reason: 'Direct writes risk corrupting RemNote state; this bridge keeps internal DB work read-only by policy.',
        },
      ],
    };
  }

  async getSdkGapReport(params: CapabilityInspectorParams = {}): Promise<unknown> {
    const inspector = await this.getCapabilityInspector(params) as Record<string, unknown>;
    return {
      pluginVersion: '2.58.0',
      sdkVersion: '0.0.46',
      matrix: inspector.matrix,
      sdkRemMethodAllowlist: inspector.sdkRemMethodAllowlist,
      rawRemMethodAllowlist: inspector.rawRemMethodAllowlist,
      sdkNamespaceReadAllowlist: inspector.sdkNamespaceReadAllowlist,
      recommendations: [
        'Prefer explicit typed bridge actions for common workflows; use safe_migration_plan before broad write operations, safe_migration_apply only with explicit confirmation, then inspect safe_migration_audit_log and dry-run safe_migration_validate_rollback before calling safe_migration_apply_rollback.',
        'Use sdk_namespace_call for allowlisted read-only App/Window/Editor/Queue/Date SDK methods, and use inspect_app_context, inspect_editor_context, inspect_queue_context when you want stable structured snapshots instead of one-off calls.',
        'Use inspect_rem_object_state for one-call RemObject type/format/todo/practice/portal/powerup snapshots; use inspect_rem_graph_context for sibling/tag-chain/reference/container context; use control_rem_object_state and control_rem_structure with dryRun plus explicit confirmation gates for selected RemObject mutations.',
        'Use rich_text_parse_markdown, rich_text_format_range and rich_text_inspect before write-heavy note/template/card operations when you need to verify exact RemNote rich text output; use rich_text_insert_html with dryRun first and confirm=IMPORT_HTML_TO_REM only after inspecting the preflight and target snapshot.',
        'Use host_remnote_sdk_surface_gap_report to parse local @remnote/plugin-sdk declaration files, compare SDK methods with bridge actions/rem_sdk_call allowlists, and read current action coverage in one JSON report.',
        'Use export_vault_snapshot for paginated SDK-visible vault reads, host_remnote_vault_snapshot_export when the same data should be written as one JSONL file in the host cache, host_remnote_vault_snapshot_export_partitioned for large resumable JSONL part exports, host_remnote_vault_export_catalog to discover cached exports, host_remnote_vault_export_query to search/filter those JSONL exports with optional cursorMode/nextCursor pagination, host_remnote_vault_export_schema_profile to map JSON field paths/types/samples before deeper DB analysis, host_remnote_vault_export_field_profile to inspect selected field value distributions/top values across the whole export or a filtered subset, host_remnote_vault_export_stats to summarize structure/counts with optional cursorMode/nextCursor pagination, host_remnote_vault_export_stats_aggregate to stream a merged inventory rollup with chunk summaries, host_remnote_vault_quality_report to score real missing timestamp/title/property/relation/practice signals, report omitted export fields separately as schemaCoverage, and expose repairPlanPreview for read-only safe-migration/export/manual-review triage, host_remnote_vault_export_graph to transform a JSONL export into nodes_edges_v1 graph JSON, host_remnote_vault_export_graph_file to stream graph nodes/edges/manifest JSONL files, host_remnote_vault_graph_export_catalog and host_remnote_vault_graph_export_query to discover/search those graph packages, host_remnote_vault_export_diff to compare two JSONL exports before/after a migration; query/field/schema/stats/aggregate/quality/diff/graph actions read every part file automatically when exportId/exportDir selects a partitioned export. Use indexeddb_* for plugin-origin DB reads, host_remnote_* for AppData LevelDB snapshot forensics/table/log/entity-index decode, host_remnote_leveldb_graph_export for SDK-enriched DB graph JSON, host_remnote_leveldb_sdk_map for one-call DB-to-SDK reconciliation, host_remnote_db_doctor_scan for issue-oriented DB health reports, and probe_rem_ids for targeted Rem ID probes; keep all writes on SDK actions.',
        'Mark native UI-only behavior as needs_ui_automation instead of pretending it is supported by SDK.',
      ],
    };
  }

  private serializedValueToPlainText(value: unknown): string {
    if (value === null || value === undefined) return '';
    if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
      return String(value);
    }
    if (Array.isArray(value)) {
      return value.map((item) => this.serializedValueToPlainText(item)).join('');
    }
    if (typeof value === 'object') {
      const record = value as Record<string, unknown>;
      if (typeof record.text === 'string') return record.text;
      if (typeof record.title === 'string') return record.title;
      return Object.values(record).map((item) => this.serializedValueToPlainText(item)).join('');
    }
    return '';
  }

  private normalizeLookupTitle(value: string): string {
    return (value || '').toLocaleLowerCase('tr-TR').replace(/[^a-z0-9]+/g, ' ').trim();
  }

  private parseLearningDateMillis(value: string, fallback: number | undefined): { value: number; source: 'property' | 'createdAt' | 'unknown' } {
    const text = (value || '').trim();
    if (text) {
      const isoLike = /^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{1,2}):(\d{2}))?/.exec(text);
      if (isoLike) {
        const parsed = new Date(
          Number(isoLike[1]),
          Number(isoLike[2]) - 1,
          Number(isoLike[3]),
          isoLike[4] ? Number(isoLike[4]) : 0,
          isoLike[5] ? Number(isoLike[5]) : 0
        ).getTime();
        if (Number.isFinite(parsed)) return { value: parsed, source: 'property' };
      }

      const relaxedText = text.replace(/\b(\d{1,2})(st|nd|rd|th)\b/gi, '$1');
      const parsed = Date.parse(relaxedText);
      if (Number.isFinite(parsed)) return { value: parsed, source: 'property' };
    }

    if (typeof fallback === 'number' && Number.isFinite(fallback)) {
      return { value: fallback, source: 'createdAt' };
    }
    return { value: 0, source: 'unknown' };
  }

  private formatLocalLearningDate(timestamp: number | undefined): string {
    if (typeof timestamp !== 'number' || !Number.isFinite(timestamp) || timestamp <= 0) return '';
    const date = new Date(timestamp);
    const pad = (value: number) => String(value).padStart(2, '0');
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
  }

  private async getSafeMigrationRemSnapshot(rem: PluginRem, includeSnapshot: boolean): Promise<Record<string, unknown>> {
    const [summary, tags] = await Promise.all([
      this.getRemSummary(rem, { includeTypeFlags: includeSnapshot, includePowerups: includeSnapshot }),
      rem.getTagRems().catch(() => [] as PluginRem[]),
    ]);
    return {
      ...summary,
      tags: await Promise.all(tags.map((tag) => this.getRemSummary(tag))),
    };
  }

  private async resolveParentForMigrationPlan(parentId: unknown): Promise<{ parentId: string | null; title: string; found: boolean; warning?: string }> {
    const target = typeof parentId === 'string' ? parentId.trim() : '';
    if (!target) {
      return { parentId: null, title: 'Root', found: true };
    }

    let parentRem: PluginRem | undefined;
    if (this.isUUID(target)) {
      parentRem = await this.plugin.rem.findOne(target);
    }

    if (!parentRem) {
      const variants = this.buildNameVariants(target);
      for (const variant of variants) {
        parentRem = await this.plugin.rem.findByName([variant], null);
        if (parentRem) break;
      }
    }

    if (!parentRem) {
      const variants = this.buildNameVariants(target);
      for (const variant of variants) {
        const results = await this.plugin.search.search(this.textToPlainRichText(variant), undefined, { numResults: 1 });
        if (results && results.length > 0) {
          parentRem = results[0];
          break;
        }
      }
    }

    if (!parentRem) {
      return {
        parentId: null,
        title: '',
        found: false,
        warning: `Parent target could not be resolved during dry-run: ${target}`,
      };
    }

    return { parentId: parentRem._id, title: await this.getRemText(parentRem), found: true };
  }

  private async buildSafeMigrationStep(
    operation: SafeMigrationPlanOperation,
    index: number,
    includeSnapshot: boolean
  ): Promise<Record<string, unknown>> {
    const action = String(operation.action || '').trim();
    const payload = operation.payload || {};
    const step: Record<string, unknown> = {
      index,
      id: operation.id || `op-${index + 1}`,
      action,
      supported: true,
      readOnly: true,
      wouldApply: false,
      risk: 'low',
      warnings: [] as string[],
      before: null,
      after: null,
      rollbackActions: [] as Array<Record<string, unknown>>,
    };
    const warnings = step.warnings as string[];
    const remId = typeof payload.remId === 'string' ? payload.remId : '';
    const rem = remId ? await this.plugin.rem.findOne(remId) : undefined;

    if (!rem && action !== 'unsupported') {
      step.supported = false;
      step.blocked = true;
      step.error = remId ? `Rem not found: ${remId}` : 'Operation payload requires remId';
      step.risk = 'unknown';
      return step;
    }

    switch (action) {
      case 'update_note': {
        const currentTitle = await this.getRemText(rem as PluginRem);
        const appendContent = typeof payload.appendContent === 'string' ? payload.appendContent : '';
        const addTags = Array.isArray(payload.addTags) ? payload.addTags.map(String) : [];
        const removeTags = Array.isArray(payload.removeTags) ? payload.removeTags.map(String) : [];
        const newTitle = typeof payload.title === 'string' && payload.title.trim() ? payload.title : currentTitle;
        step.risk = appendContent || addTags.length || removeTags.length ? 'medium' : 'low';
        step.before = await this.getSafeMigrationRemSnapshot(rem as PluginRem, includeSnapshot);
        step.after = {
          remId,
          title: newTitle,
          headingLevel: typeof payload.headingLevel === 'number' ? payload.headingLevel : undefined,
          appendedLineCount: appendContent.split('\n').map((line) => line.trim()).filter(Boolean).length,
          addTags,
          removeTags,
        };
        const rollback: Array<Record<string, unknown>> = [];
        if (newTitle !== currentTitle) rollback.push({ action: 'update_note', payload: { remId, title: currentTitle } });
        for (const tagName of addTags) rollback.push({ action: 'update_note', payload: { remId, removeTags: [tagName] } });
        for (const tagName of removeTags) rollback.push({ action: 'update_note', payload: { remId, addTags: [tagName] } });
        if (appendContent) warnings.push('Appended children do not exist yet, so exact rollback requires checking created child IDs after apply.');
        step.rollbackActions = rollback;
        break;
      }
      case 'move_note': {
        const parent = await (rem as PluginRem).getParentRem();
        const target = await this.resolveParentForMigrationPlan(payload.parentId);
        if (!target.found) {
          step.blocked = true;
          warnings.push(target.warning || 'Target parent could not be resolved.');
        }
        step.risk = 'medium';
        step.before = {
          ...(await this.getSafeMigrationRemSnapshot(rem as PluginRem, includeSnapshot)),
          parentId: parent?._id ?? null,
          parentTitle: parent ? await this.getRemText(parent) : 'Root',
        };
        step.after = {
          remId,
          parentId: target.parentId,
          parentTitle: target.title,
          positionAmongstSiblings: typeof payload.positionAmongstSiblings === 'number' ? payload.positionAmongstSiblings : undefined,
        };
        step.rollbackActions = [{ action: 'move_note', payload: { remId, parentId: parent?._id ?? null } }];
        break;
      }
      case 'set_tag_property_value': {
        const propertyId = typeof payload.propertyId === 'string' ? payload.propertyId : '';
        const property = propertyId ? await this.plugin.rem.findOne(propertyId) : undefined;
        if (!property) {
          step.blocked = true;
          step.error = propertyId ? `Property rem not found: ${propertyId}` : 'Operation payload requires propertyId';
        }
        const currentRaw = property ? await (rem as PluginRem).getTagPropertyValue(property._id).catch(() => undefined) : undefined;
        const currentSerialized = await this.serializeForBridge(currentRaw, 5);
        const currentPlain = this.serializedValueToPlainText(currentSerialized);
        const nextValue = typeof payload.value === 'string' ? payload.value : '';
        step.risk = 'low';
        step.before = {
          rem: await this.getSafeMigrationRemSnapshot(rem as PluginRem, includeSnapshot),
          propertyId,
          propertyTitle: property ? await this.getRemText(property) : '',
          value: currentSerialized,
          valuePlain: currentPlain,
        };
        step.after = { remId, propertyId, value: nextValue };
        step.rollbackActions = [{ action: 'set_tag_property_value', payload: { remId, propertyId, value: currentPlain } }];
        break;
      }
      case 'add_tag_by_id':
      case 'remove_tag_by_id': {
        const tagId = typeof payload.tagId === 'string' ? payload.tagId : '';
        const tag = tagId ? await this.plugin.rem.findOne(tagId) : undefined;
        if (!tag) {
          step.blocked = true;
          step.error = tagId ? `Tag rem not found: ${tagId}` : 'Operation payload requires tagId';
        }
        const existingTags = await (rem as PluginRem).getTagRems().catch(() => [] as PluginRem[]);
        const alreadyTagged = existingTags.some((item) => item._id === tagId);
        step.before = {
          rem: await this.getSafeMigrationRemSnapshot(rem as PluginRem, includeSnapshot),
          alreadyTagged,
        };
        step.after = {
          remId,
          tagId,
          tagTitle: tag ? await this.getRemText(tag) : '',
          tagged: action === 'add_tag_by_id',
          removeProperties: action === 'remove_tag_by_id' ? payload.removeProperties === true : undefined,
        };
        if (action === 'add_tag_by_id') {
          if (alreadyTagged) warnings.push('Tag is already present; applying this operation is likely a no-op.');
          step.rollbackActions = alreadyTagged ? [] : [{ action: 'remove_tag_by_id', payload: { remId, tagId, removeProperties: false } }];
        } else {
          step.risk = payload.removeProperties === true ? 'high' : 'medium';
          if (!alreadyTagged) warnings.push('Tag is not currently present; applying this operation is likely a no-op.');
          if (payload.removeProperties === true) warnings.push('removeProperties=true may discard tag property values.');
          step.rollbackActions = alreadyTagged ? [{ action: 'add_tag_by_id', payload: { remId, tagId } }] : [];
        }
        break;
      }
      case 'delete_note': {
        const children = await (rem as PluginRem).getChildrenRem().catch(() => [] as PluginRem[]);
        step.risk = 'high';
        step.before = await this.getSafeMigrationRemSnapshot(rem as PluginRem, true);
        step.after = { remId, deleted: true, descendantRisk: children.length > 0 };
        step.rollbackActions = [];
        warnings.push('Delete rollback is not automatic. Export the subtree before applying and recreate from backup if needed.');
        break;
      }
      default:
        step.supported = false;
        step.blocked = true;
        step.risk = 'unknown';
        step.error = `safe_migration_plan does not support action: ${action}`;
        step.supportedActions = ['update_note', 'move_note', 'set_tag_property_value', 'add_tag_by_id', 'remove_tag_by_id', 'delete_note'];
        break;
    }

    return step;
  }

  async safeMigrationPlan(params: SafeMigrationPlanParams): Promise<unknown> {
    const operations = Array.isArray(params.operations) ? params.operations : [];
    const maxOperations = this.clampLimit(params.maxOperations, 50, 200);
    const includeSnapshots = params.includeSnapshots !== false;
    const selected = operations.slice(0, maxOperations);
    const steps = [];

    for (let index = 0; index < selected.length; index += 1) {
      steps.push(await this.buildSafeMigrationStep(selected[index], index, includeSnapshots));
    }

    const riskRank: Record<string, number> = { unknown: 0, low: 1, medium: 2, high: 3 };
    const highestRisk = steps
      .map((step) => String(step.risk || 'unknown'))
      .sort((a, b) => (riskRank[b] || 0) - (riskRank[a] || 0))[0] || 'unknown';
    const blocked = steps.filter((step) => step.blocked === true);
    const rollbackPlan = steps.flatMap((step) => Array.isArray(step.rollbackActions) ? step.rollbackActions : []);

    return {
      readOnly: true,
      dryRun: true,
      mutationApplied: false,
      mode: 'safe_migration_plan',
      operationCount: selected.length,
      truncated: operations.length > selected.length,
      supportedCount: steps.filter((step) => step.supported === true).length,
      blockedCount: blocked.length,
      highestRisk,
      includeSnapshots,
      steps,
      rollbackPlan,
      warnings: blocked.length > 0
        ? ['Some operations are blocked; fix them before applying any matching live writes.']
        : [],
    };
  }

  private newSafeMigrationAuditId(): string {
    const cryptoApi = typeof crypto !== 'undefined' ? crypto as Crypto & { randomUUID?: () => string } : undefined;
    if (cryptoApi?.randomUUID) {
      return `mig_${cryptoApi.randomUUID()}`;
    }
    return `mig_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
  }

  private async readSafeMigrationAuditEntries(): Promise<Array<Record<string, unknown>>> {
    const stored = await this.plugin.storage.getSynced<Array<Record<string, unknown>>>(this.SAFE_MIGRATION_AUDIT_LOG_KEY);
    return Array.isArray(stored) ? stored : [];
  }

  private async appendSafeMigrationAuditEntry(entry: Record<string, unknown>): Promise<void> {
    const existing = await this.readSafeMigrationAuditEntries();
    const updated = [entry, ...existing].slice(0, 50);
    await this.plugin.storage.setSynced(this.SAFE_MIGRATION_AUDIT_LOG_KEY, updated);
  }

  private compactSafeMigrationApplyResults(results: Array<Record<string, unknown>>): Array<Record<string, unknown>> {
    return results.map((result) => ({
      index: result.index,
      id: result.id,
      action: result.action,
      success: result.success,
      error: result.error,
      remId: (result.result as Record<string, unknown> | undefined)?.remId || (result.afterApply as Record<string, unknown> | undefined)?.remId,
      title: (result.afterApply as Record<string, unknown> | undefined)?.title,
    }));
  }

  async safeMigrationAuditLog(params: SafeMigrationAuditLogParams = {}): Promise<unknown> {
    const limit = this.clampLimit(params.limit, 20, 50);
    const includePlans = params.includePlans === true;
    const entries = await this.readSafeMigrationAuditEntries();
    const filtered = params.auditId
      ? entries.filter((entry) => entry.auditId === params.auditId)
      : entries;
    const rows = filtered.slice(0, limit).map((entry) => {
      if (includePlans) {
        return entry;
      }
      const { preflightPlan, rollbackPlan, results, ...summary } = entry;
      return {
        ...summary,
        rollbackCount: Array.isArray(rollbackPlan) ? rollbackPlan.length : 0,
        resultCount: Array.isArray(results) ? results.length : 0,
        hasPreflightPlan: Boolean(preflightPlan),
      };
    });
    return {
      readOnly: true,
      mode: 'safe_migration_audit_log',
      total: entries.length,
      returned: rows.length,
      auditId: params.auditId || null,
      includePlans,
      rows,
    };
  }

  private async resolveSafeMigrationRollbackPlan(params: SafeMigrationValidateRollbackParams = {}): Promise<{
    rollbackPlan: SafeMigrationPlanOperation[];
    sourceAudit: Record<string, unknown> | null;
  }> {
    let rollbackPlan = Array.isArray(params.rollbackPlan) ? params.rollbackPlan : undefined;
    let sourceAudit: Record<string, unknown> | null = null;
    if (!rollbackPlan && params.auditId) {
      const entries = await this.readSafeMigrationAuditEntries();
      sourceAudit = entries.find((entry) => entry.auditId === params.auditId) || null;
      if (!sourceAudit) {
        throw new Error(`Migration audit entry not found: ${params.auditId}`);
      }
      rollbackPlan = Array.isArray(sourceAudit.rollbackPlan)
        ? sourceAudit.rollbackPlan as SafeMigrationPlanOperation[]
        : [];
    }
    if (!rollbackPlan) {
      throw new Error('safe_migration_validate_rollback requires rollbackPlan or auditId');
    }
    return { rollbackPlan, sourceAudit };
  }

  async safeMigrationValidateRollback(params: SafeMigrationValidateRollbackParams = {}): Promise<unknown> {
    const { rollbackPlan, sourceAudit } = await this.resolveSafeMigrationRollbackPlan(params);
    const validationPlan = await this.safeMigrationPlan({
      operations: rollbackPlan,
      maxOperations: params.maxOperations,
      includeSnapshots: params.includeSnapshots !== false,
    }) as Record<string, unknown>;
    return {
      readOnly: true,
      dryRun: true,
      mutationApplied: false,
      mode: 'safe_migration_validate_rollback',
      sourceAuditId: params.auditId || null,
      rollbackOperationCount: rollbackPlan.length,
      blockedCount: validationPlan.blockedCount,
      highestRisk: validationPlan.highestRisk,
      valid: Number(validationPlan.blockedCount || 0) === 0,
      validationPlan,
      sourceAuditSummary: sourceAudit
        ? {
            auditId: sourceAudit.auditId,
            createdAt: sourceAudit.createdAt,
            success: sourceAudit.success,
            appliedCount: sourceAudit.appliedCount,
            failedCount: sourceAudit.failedCount,
          }
        : null,
    };
  }

  async safeMigrationApplyRollback(params: SafeMigrationApplyRollbackParams = {}): Promise<unknown> {
    const confirmText = 'APPLY_SAFE_ROLLBACK';
    const { rollbackPlan, sourceAudit } = await this.resolveSafeMigrationRollbackPlan(params);
    const sourceAuditId = params.auditId || (typeof sourceAudit?.auditId === 'string' ? sourceAudit.auditId : null);
    const validation = await this.safeMigrationValidateRollback({
      rollbackPlan,
      auditId: params.auditId,
      includeSnapshots: params.includeSnapshots !== false,
      maxOperations: params.maxOperations,
    }) as Record<string, unknown>;

    if (params.confirm !== confirmText) {
      return {
        success: false,
        requiresConfirmation: true,
        confirmationText: confirmText,
        readOnly: false,
        dryRun: false,
        mutationApplied: false,
        mode: 'safe_migration_apply_rollback',
        reason: 'Confirmation text is required before applying rollback operations.',
        sourceAuditId,
        rollbackOperationCount: rollbackPlan.length,
        validation,
      };
    }

    if (Number(validation.blockedCount || 0) > 0) {
      return {
        success: false,
        blocked: true,
        readOnly: false,
        dryRun: false,
        mutationApplied: false,
        mode: 'safe_migration_apply_rollback',
        reason: 'Rollback validation contains blocked operations.',
        sourceAuditId,
        rollbackOperationCount: rollbackPlan.length,
        validation,
      };
    }

    const highestRisk = String(validation.highestRisk || 'unknown');
    if (highestRisk === 'high' && params.allowHighRisk !== true) {
      return {
        success: false,
        blocked: true,
        readOnly: false,
        dryRun: false,
        mutationApplied: false,
        mode: 'safe_migration_apply_rollback',
        reason: 'High-risk rollback requires allowHighRisk=true.',
        sourceAuditId,
        rollbackOperationCount: rollbackPlan.length,
        validation,
      };
    }

    const hasDelete = rollbackPlan.some((operation) => operation.action === 'delete_note');
    if (hasDelete && params.allowDelete !== true) {
      return {
        success: false,
        blocked: true,
        readOnly: false,
        dryRun: false,
        mutationApplied: false,
        mode: 'safe_migration_apply_rollback',
        reason: 'delete_note rollback operations require allowDelete=true and a separate backup/export plan.',
        sourceAuditId,
        rollbackOperationCount: rollbackPlan.length,
        validation,
      };
    }

    const applyResult = await this.safeMigrationApply({
      operations: rollbackPlan,
      maxOperations: params.maxOperations,
      includeSnapshots: true,
      confirm: 'APPLY_SAFE_MIGRATION',
      allowHighRisk: params.allowHighRisk,
      allowDelete: params.allowDelete,
      stopOnError: params.stopOnError,
      auditMode: 'safe_migration_apply_rollback',
      auditContext: {
        sourceAuditId,
        sourceAction: 'safe_migration_apply',
      },
    }) as Record<string, unknown>;

    return {
      success: applyResult.success === true,
      readOnly: false,
      dryRun: false,
      mutationApplied: applyResult.mutationApplied === true,
      mode: 'safe_migration_apply_rollback',
      sourceAuditId,
      rollbackAuditId: applyResult.auditId || null,
      rollbackOperationCount: rollbackPlan.length,
      validation,
      applyResult,
      warnings: [
        'Rollback apply uses the advisory rollback plan from the selected audit entry. Review nested applyResult before chaining additional rollback actions.',
      ],
    };
  }

  private async applySafeMigrationOperation(operation: SafeMigrationPlanOperation): Promise<unknown> {
    const payload = operation.payload || {};
    switch (operation.action) {
      case 'update_note':
        return this.updateNote({
          remId: String(payload.remId || ''),
          title: typeof payload.title === 'string' ? payload.title : undefined,
          headingLevel: typeof payload.headingLevel === 'number' ? payload.headingLevel : undefined,
          appendContent: typeof payload.appendContent === 'string' ? payload.appendContent : undefined,
          addTags: Array.isArray(payload.addTags) ? payload.addTags.map(String) : undefined,
          removeTags: Array.isArray(payload.removeTags) ? payload.removeTags.map(String) : undefined,
        });
      case 'move_note':
        return this.moveNote({
          remId: String(payload.remId || ''),
          parentId: typeof payload.parentId === 'string' ? payload.parentId : (payload.parentId === null ? null : undefined),
          positionAmongstSiblings: typeof payload.positionAmongstSiblings === 'number' ? payload.positionAmongstSiblings : undefined,
        });
      case 'set_tag_property_value':
        return this.setTagPropertyValue({
          remId: String(payload.remId || ''),
          propertyId: String(payload.propertyId || ''),
          value: typeof payload.value === 'string' ? payload.value : undefined,
        });
      case 'add_tag_by_id':
        return this.addTagById({
          remId: String(payload.remId || ''),
          tagId: String(payload.tagId || ''),
        });
      case 'remove_tag_by_id':
        return this.removeTagById({
          remId: String(payload.remId || ''),
          tagId: String(payload.tagId || ''),
          removeProperties: payload.removeProperties === true,
        });
      case 'delete_note':
        return this.deleteNote({
          remId: String(payload.remId || ''),
        });
      default:
        throw new Error(`safe_migration_apply does not support action: ${operation.action}`);
    }
  }

  async safeMigrationApply(params: SafeMigrationApplyParams): Promise<unknown> {
    const operations = Array.isArray(params.operations) ? params.operations : [];
    const preflightPlan = await this.safeMigrationPlan({
      operations,
      maxOperations: params.maxOperations,
      includeSnapshots: true,
    }) as Record<string, unknown>;
    const steps = Array.isArray(preflightPlan.steps) ? preflightPlan.steps as Array<Record<string, unknown>> : [];
    const confirmText = 'APPLY_SAFE_MIGRATION';

    if (params.confirm !== confirmText) {
      return {
        success: false,
        requiresConfirmation: true,
        confirmationText: confirmText,
        readOnly: false,
        dryRun: false,
        mutationApplied: false,
        mode: 'safe_migration_apply',
        reason: 'Confirmation text is required before applying a migration.',
        preflightPlan,
      };
    }

    if (Number(preflightPlan.blockedCount || 0) > 0) {
      return {
        success: false,
        blocked: true,
        readOnly: false,
        dryRun: false,
        mutationApplied: false,
        mode: 'safe_migration_apply',
        reason: 'Preflight plan contains blocked operations.',
        preflightPlan,
      };
    }

    const highestRisk = String(preflightPlan.highestRisk || 'unknown');
    if (highestRisk === 'high' && params.allowHighRisk !== true) {
      return {
        success: false,
        blocked: true,
        readOnly: false,
        dryRun: false,
        mutationApplied: false,
        mode: 'safe_migration_apply',
        reason: 'High-risk migration requires allowHighRisk=true.',
        preflightPlan,
      };
    }

    const hasDelete = operations.some((operation) => operation.action === 'delete_note');
    if (hasDelete && params.allowDelete !== true) {
      return {
        success: false,
        blocked: true,
        readOnly: false,
        dryRun: false,
        mutationApplied: false,
        mode: 'safe_migration_apply',
        reason: 'delete_note migrations require allowDelete=true and a separate backup/export plan.',
        preflightPlan,
      };
    }

    const maxOperations = this.clampLimit(params.maxOperations, 50, 200);
    const selected = operations.slice(0, maxOperations);
    const stopOnError = params.stopOnError !== false;
    const results: Array<Record<string, unknown>> = [];
    let failedCount = 0;

    for (let index = 0; index < selected.length; index += 1) {
      const operation = selected[index];
      try {
        const result = await this.applySafeMigrationOperation(operation);
        const remId = typeof operation.payload?.remId === 'string' ? operation.payload.remId : '';
        const rem = remId ? await this.plugin.rem.findOne(remId) : undefined;
        results.push({
          index,
          id: operation.id || `op-${index + 1}`,
          action: operation.action,
          success: true,
          result,
          afterApply: rem ? await this.getSafeMigrationRemSnapshot(rem, false) : null,
        });
      } catch (err) {
        failedCount += 1;
        results.push({
          index,
          id: operation.id || `op-${index + 1}`,
          action: operation.action,
          success: false,
          error: err instanceof Error ? err.message : String(err),
        });
        if (stopOnError) {
          break;
        }
      }
    }

    const appliedCount = results.filter((result) => result.success === true).length;
    const rollbackPlan = Array.isArray(preflightPlan.rollbackPlan)
      ? preflightPlan.rollbackPlan as SafeMigrationPlanOperation[]
      : [];
    let auditId: string | null = null;
    let auditError: string | null = null;
    if (appliedCount > 0) {
      auditId = this.newSafeMigrationAuditId();
      const auditEntry = {
        auditId,
        createdAt: new Date().toISOString(),
        success: failedCount === 0,
        mode: params.auditMode || 'safe_migration_apply',
        auditContext: params.auditContext || null,
        operationCount: selected.length,
        appliedCount,
        failedCount,
        highestRisk: preflightPlan.highestRisk || 'unknown',
        stopOnError,
        operations: selected,
        preflightSummary: {
          operationCount: preflightPlan.operationCount,
          supportedCount: preflightPlan.supportedCount,
          blockedCount: preflightPlan.blockedCount,
          highestRisk: preflightPlan.highestRisk,
        },
        preflightPlan,
        rollbackPlan,
        results: this.compactSafeMigrationApplyResults(results),
      };
      try {
        await this.appendSafeMigrationAuditEntry(auditEntry);
      } catch (err) {
        auditError = err instanceof Error ? err.message : String(err);
      }
    }

    return {
      success: failedCount === 0,
      readOnly: false,
      dryRun: false,
      mutationApplied: appliedCount > 0,
      mode: 'safe_migration_apply',
      auditId,
      auditError,
      operationCount: selected.length,
      appliedCount,
      failedCount,
      stopOnError,
      preflightPlan,
      rollbackPlan,
      results,
      warnings: [
        'Rollback plan is advisory. Review it before applying reverse actions, especially after delete or append operations.',
      ],
    };
  }

  async getAllRems(params: GetAllRemsParams = {}): Promise<unknown> {
    const limit = this.clampLimit(params.limit, 100, 1000);
    const offset = Math.max(0, Math.floor(params.offset || 0));
    const query = (params.query || '').trim().toLocaleLowerCase('tr-TR');

    if (query) {
      const searchLimit = Math.min(Math.max(offset + limit, limit), 1000);
      const searchResults = await this.plugin.search.search(this.textToPlainRichText(params.query || ''), undefined, {
        numResults: searchLimit,
      });
      const rows = [];
      for (const rem of searchResults.slice(offset, offset + limit)) {
        rows.push(await this.getRemSummary(rem, {
          includeTypeFlags: params.includeTypeFlags,
          includePowerups: params.includePowerups,
        }));
      }
      return {
        mode: 'search',
        totalAccessible: undefined,
        totalMatched: searchResults.length,
        offset,
        limit,
        returned: rows.length,
        rows,
      };
    }

    const all = await this.plugin.rem.getAll();
    let page: PluginRem[] = [];
    if (params.sortBy === 'title') {
      const titled = [];
      for (const rem of all.slice(0, Math.min(all.length, 5000))) {
        titled.push({
          rem,
          title: await this.getRemText(rem),
          createdAt: rem.createdAt,
          updatedAt: rem.updatedAt,
          localUpdatedAt: rem.localUpdatedAt,
        });
      }
      page = this.sortRemSummaries(titled, params.sortBy, params.direction).slice(offset, offset + limit).map((row) => row.rem);
    } else {
      const sortedRems = [...all].sort((a, b) => {
        const key = params.sortBy === 'createdAt' || params.sortBy === 'localUpdatedAt' ? params.sortBy : 'updatedAt';
        const av = typeof a[key] === 'number' ? a[key] : 0;
        const bv = typeof b[key] === 'number' ? b[key] : 0;
        return params.direction === 'asc' ? av - bv : bv - av;
      });
      page = sortedRems.slice(offset, offset + limit);
    }

    const rows: Array<Record<string, unknown>> = [];
    for (const rem of page) {
      const summary = await this.getRemSummary(rem, {
        includeTypeFlags: params.includeTypeFlags,
        includePowerups: params.includePowerups,
      });
      rows.push(summary);
    }

    return {
      mode: 'all',
      totalAccessible: all.length,
      totalMatched: all.length,
      offset,
      limit,
      returned: rows.length,
      rows,
    };
  }

  private async getVaultRelationBlock(
    items: PluginRem[],
    relationMode: 'counts' | 'ids' | 'summaries',
    maxRelationSummaries: number
  ): Promise<Record<string, unknown>> {
    const block: Record<string, unknown> = {
      count: items.length,
    };
    if (relationMode === 'ids' || relationMode === 'summaries') {
      block.ids = items.map((item) => item._id);
    }
    if (relationMode === 'summaries') {
      block.summaries = await Promise.all(items.slice(0, maxRelationSummaries).map((item) => this.getRemSummary(item)));
      block.summariesTruncated = items.length > maxRelationSummaries;
    }
    return block;
  }

  private async getVaultPropertyRows(rem: PluginRem, valueDepth: number): Promise<Array<Record<string, unknown>>> {
    const tags = await rem.getTagRems().catch(() => [] as PluginRem[]);
    const rows: Array<Record<string, unknown>> = [];
    const seen = new Set<string>();
    for (const tag of tags) {
      const tagProperties = await this.getDirectPropertyChildren(tag);
      for (const property of tagProperties) {
        const key = `${tag._id}:${property.remId}`;
        if (seen.has(key)) continue;
        seen.add(key);
        try {
          const value = await this.serializeForBridge(await rem.getTagPropertyValue(property.remId), valueDepth);
          rows.push({
            tagId: tag._id,
            tagTitle: await this.getRemText(tag),
            propertyId: property.remId,
            propertyTitle: property.title,
            value,
            valuePlain: this.serializedValueToPlainText(value).trim(),
          });
        } catch (err) {
          rows.push({
            tagId: tag._id,
            tagTitle: await this.getRemText(tag),
            propertyId: property.remId,
            propertyTitle: property.title,
            error: err instanceof Error ? err.message : String(err),
          });
        }
      }
    }
    return rows;
  }

  async exportVaultSnapshot(params: ExportVaultSnapshotParams = {}): Promise<unknown> {
    const limit = this.clampLimit(params.limit, 100, 500);
    const offset = Math.max(0, Math.floor(params.offset || 0));
    const sortBy = params.sortBy || 'updatedAt';
    const direction = params.direction || 'desc';
    const includeRawText = params.includeRawText === true;
    const includeBackText = params.includeBackText === true;
    const includeRelations = params.includeRelations !== false;
    const relationMode = params.relationMode || 'ids';
    const maxRelationSummaries = this.clampLimit(params.maxRelationSummaries, 10, 100);
    const includeProperties = params.includeProperties === true;
    const includePracticeData = params.includePracticeData === true;
    const includeCards = params.includeCards === true;
    const valueDepth = this.clampLimit(params.valueDepth, 5, 10);

    const all = await this.plugin.rem.getAll();
    let page: PluginRem[] = [];
    if (sortBy === 'title') {
      const titled = [];
      for (const rem of all.slice(0, Math.min(all.length, 10000))) {
        titled.push({
          rem,
          title: await this.getRemText(rem),
          createdAt: rem.createdAt,
          updatedAt: rem.updatedAt,
          localUpdatedAt: rem.localUpdatedAt,
        });
      }
      page = this.sortRemSummaries(titled, sortBy, direction).slice(offset, offset + limit).map((row) => row.rem);
    } else {
      const sortedRems = [...all].sort((a, b) => {
        const key = sortBy === 'createdAt' || sortBy === 'localUpdatedAt' ? sortBy : 'updatedAt';
        const av = typeof a[key] === 'number' ? a[key] : 0;
        const bv = typeof b[key] === 'number' ? b[key] : 0;
        return direction === 'asc' ? av - bv : bv - av;
      });
      page = sortedRems.slice(offset, offset + limit);
    }

    const rows: Array<Record<string, unknown>> = [];
    for (const rem of page) {
      const row = await this.getRemSummary(rem, {
        includeTypeFlags: params.includeTypeFlags,
        includePowerups: params.includePowerups,
      });
      if (includeRawText) row.rawText = await this.getRawRichText(rem, 'text');
      if (includeBackText) row.backText = await this.getRawRichText(rem, 'backText');
      if (includeRelations) {
        const [tags, sources, aliases, refsOut, refsIn, portals] = await Promise.all([
          rem.getTagRems().catch(() => [] as PluginRem[]),
          rem.getSources().catch(() => [] as PluginRem[]),
          rem.getAliases().catch(() => [] as PluginRem[]),
          rem.remsBeingReferenced().catch(() => [] as PluginRem[]),
          rem.remsReferencingThis().catch(() => [] as PluginRem[]),
          rem.portalsAndDocumentsIn().catch(() => [] as PluginRem[]),
        ]);
        row.relations = {
          tags: await this.getVaultRelationBlock(tags, relationMode, maxRelationSummaries),
          sources: await this.getVaultRelationBlock(sources, relationMode, maxRelationSummaries),
          aliases: await this.getVaultRelationBlock(aliases, relationMode, maxRelationSummaries),
          referencesOut: await this.getVaultRelationBlock(refsOut, relationMode, maxRelationSummaries),
          referencesIn: await this.getVaultRelationBlock(refsIn, relationMode, maxRelationSummaries),
          portalsAndDocumentsIn: await this.getVaultRelationBlock(portals, relationMode, maxRelationSummaries),
        };
      }
      if (includeProperties) {
        row.properties = await this.getVaultPropertyRows(rem, valueDepth);
      }
      if (includePracticeData) {
        row.practice = {
          isCardItem: await rem.isCardItem().catch(() => undefined),
          enablePractice: await rem.getEnablePractice().catch(() => undefined),
          practiceDirection: await rem.getPracticeDirection().catch(() => undefined),
          lastPracticed: await rem.getLastPracticed().catch(() => undefined),
          lastTimeMovedTo: await rem.getLastTimeMovedTo().catch(() => undefined),
          ...(includeCards ? { cards: await rem.getCards().then((value) => this.serializeForBridge(value, valueDepth)).catch((err) => ({ error: err instanceof Error ? err.message : String(err) })) } : {}),
        };
      }
      rows.push(row);
    }

    return {
      readOnly: true,
      mutationApplied: false,
      mode: 'vault_snapshot',
      totalAccessible: all.length,
      offset,
      limit,
      returned: rows.length,
      truncated: offset + rows.length < all.length,
      nextOffset: offset + rows.length < all.length ? offset + rows.length : null,
      sortBy,
      direction,
      includeRawText,
      includeBackText,
      includeRelations,
      relationMode,
      includeProperties,
      includePracticeData,
      includeCards,
      rows,
      warnings: [
        'This is an SDK-visible vault snapshot, not a direct internal database dump.',
        'Use offset/limit paging for large vault exports; direct LevelDB forensic actions remain read-only snapshot tools.',
      ],
    };
  }

  async readRemFull(params: ReadRemFullParams): Promise<unknown> {
    const rem = await this.plugin.rem.findOne(params.remId);
    if (!rem) throw new Error(`Rem not found: ${params.remId}`);

    const childLimit = this.clampLimit(params.childLimit, 100, 500);
    const summary = await this.getRemSummary(rem, { includeTypeFlags: true, includePowerups: true });
    const result: Record<string, unknown> = {
      ...summary,
      rawText: await this.getRawRichText(rem, 'text'),
      backText: await this.getRawRichText(rem, 'backText'),
      fontSize: await rem.getFontSize().catch(() => undefined),
      highlightColor: await rem.getHighlightColor().catch(() => undefined),
      todoStatus: await rem.getTodoStatus().catch(() => undefined),
      enablePractice: await rem.getEnablePractice().catch(() => undefined),
      practiceDirection: await rem.getPracticeDirection().catch(() => undefined),
      schemaVersion: await rem.getSchemaVersion().catch(() => undefined),
    };

    if (params.includeChildren ?? true) {
      const children = await rem.getChildrenRem();
      result.children = await Promise.all(children.slice(0, childLimit).map((child) => this.getRemSummary(child)));
      result.childCount = children.length;
    }

    if (params.includeRelations ?? true) {
      const [tags, sources, aliases, refsOut, refsIn, portals] = await Promise.all([
        rem.getTagRems().catch(() => [] as PluginRem[]),
        rem.getSources().catch(() => [] as PluginRem[]),
        rem.getAliases().catch(() => [] as PluginRem[]),
        rem.remsBeingReferenced().catch(() => [] as PluginRem[]),
        rem.remsReferencingThis().catch(() => [] as PluginRem[]),
        rem.portalsAndDocumentsIn().catch(() => [] as PluginRem[]),
      ]);
      result.relations = {
        tags: await Promise.all(tags.map((item) => this.getRemSummary(item))),
        sources: await Promise.all(sources.map((item) => this.getRemSummary(item))),
        aliases: await Promise.all(aliases.map((item) => this.getRemSummary(item))),
        referencesOut: await Promise.all(refsOut.map((item) => this.getRemSummary(item))),
        referencesIn: await Promise.all(refsIn.map((item) => this.getRemSummary(item))),
        portalsAndDocumentsIn: await Promise.all(portals.map((item) => this.getRemSummary(item))),
      };
    }

    if (params.includeProperties) {
      const tags = await rem.getTagRems().catch(() => [] as PluginRem[]);
      const properties: Record<string, unknown> = {};
      for (const tag of tags) {
        const tagProperties = await this.getDirectPropertyChildren(tag);
        for (const property of tagProperties) {
          try {
            properties[property.remId] = {
              title: property.title,
              value: await this.serializeForBridge(await rem.getTagPropertyValue(property.remId), 5),
            };
          } catch (err) {
            properties[property.remId] = {
              title: property.title,
              error: err instanceof Error ? err.message : String(err),
            };
          }
        }
      }
      result.properties = properties;
    }

    return result;
  }

  async probeRemIds(params: ProbeRemIdsParams): Promise<unknown> {
    const requested = Array.isArray(params.remIds) ? params.remIds : [];
    const maxIds = this.clampLimit(params.maxIds, 100, 500);
    const includeMissing = params.includeMissing !== false;
    const seen = new Set<string>();
    const rows: Array<Record<string, unknown>> = [];
    let foundCount = 0;
    let missingCount = 0;
    let invalidCount = 0;
    let duplicateCount = 0;

    const sampleRelations = async (items: PluginRem[]) => ({
      count: items.length,
      sample: await Promise.all(items.slice(0, 5).map((item) => this.getRemSummary(item))),
    });

    for (const rawId of requested) {
      const remId = String(rawId || '').trim();
      if (!/^[A-Za-z0-9_-]{8,64}$/.test(remId)) {
        invalidCount += 1;
        if (includeMissing) {
          rows.push({ remId, exists: false, status: 'invalid_id' });
        }
        continue;
      }
      if (seen.has(remId)) {
        duplicateCount += 1;
        continue;
      }
      if (seen.size >= maxIds) {
        break;
      }
      seen.add(remId);

      let rem: PluginRem | undefined;
      try {
        rem = await this.plugin.rem.findOne(remId) || undefined;
      } catch (err) {
        rows.push({
          remId,
          exists: false,
          status: 'lookup_error',
          error: err instanceof Error ? err.message : String(err),
        });
        missingCount += 1;
        continue;
      }

      if (!rem) {
        missingCount += 1;
        if (includeMissing) {
          rows.push({ remId, exists: false, status: 'missing' });
        }
        continue;
      }

      foundCount += 1;
      const row: Record<string, unknown> = {
        ...(await this.getRemSummary(rem, {
          includeTypeFlags: params.includeTypeFlags,
          includePowerups: params.includePowerups,
        })),
        exists: true,
        status: 'found',
      };

      if (params.includeRelations) {
        const [tags, sources, aliases, refsOut, refsIn, portals] = await Promise.all([
          rem.getTagRems().catch(() => [] as PluginRem[]),
          rem.getSources().catch(() => [] as PluginRem[]),
          rem.getAliases().catch(() => [] as PluginRem[]),
          rem.remsBeingReferenced().catch(() => [] as PluginRem[]),
          rem.remsReferencingThis().catch(() => [] as PluginRem[]),
          rem.portalsAndDocumentsIn().catch(() => [] as PluginRem[]),
        ]);
        row.relations = {
          tags: await sampleRelations(tags),
          sources: await sampleRelations(sources),
          aliases: await sampleRelations(aliases),
          referencesOut: await sampleRelations(refsOut),
          referencesIn: await sampleRelations(refsIn),
          portalsAndDocumentsIn: await sampleRelations(portals),
        };
      }

      if (params.includeProperties) {
        const tags = await rem.getTagRems().catch(() => [] as PluginRem[]);
        const properties: Record<string, unknown> = {};
        for (const tag of tags.slice(0, 10)) {
          const tagProperties = await this.getDirectPropertyChildren(tag);
          for (const property of tagProperties.slice(0, 25)) {
            try {
              properties[property.remId] = {
                title: property.title,
                value: await this.serializeForBridge(await rem.getTagPropertyValue(property.remId), 5),
              };
            } catch (err) {
              properties[property.remId] = {
                title: property.title,
                error: err instanceof Error ? err.message : String(err),
              };
            }
          }
        }
        row.properties = properties;
        row.propertyCount = Object.keys(properties).length;
      }

      rows.push(row);
    }

    return {
      readOnly: true,
      mode: 'sdk_rem_id_probe',
      sdkVersion: '0.0.46',
      requestedCount: requested.length,
      uniqueCount: seen.size,
      returned: rows.length,
      foundCount,
      missingCount,
      invalidCount,
      duplicateCount,
      maxIds,
      rows,
    };
  }

  async exportSubtree(params: ExportSubtreeParams): Promise<unknown> {
    const root = await this.plugin.rem.findOne(params.remId);
    if (!root) throw new Error(`Root rem not found: ${params.remId}`);
    const maxNodes = this.clampLimit(params.maxNodes, 250, 2000);
    const maxDepth = Math.max(0, Math.min(typeof params.depth === 'number' ? Math.floor(params.depth) : 8, 30));
    const nodes: unknown[] = [];

    const visit = async (rem: PluginRem, depth: number): Promise<void> => {
      if (nodes.length >= maxNodes) return;
      const record = await this.getRemSummary(rem, { includeTypeFlags: false, includePowerups: params.includeRelations });
      if (params.includeRelations) {
        (record as Record<string, unknown>).tagIds = (await rem.getTagRems().catch(() => [] as PluginRem[])).map((tag) => tag._id);
        (record as Record<string, unknown>).sourceIds = (await rem.getSources().catch(() => [] as PluginRem[])).map((source) => source._id);
      }
      nodes.push(record);
      if (depth >= maxDepth) return;
      const children = await rem.getChildrenRem();
      for (const child of children) {
        await visit(child, depth + 1);
        if (nodes.length >= maxNodes) break;
      }
    };

    await visit(root, 0);
    return {
      rootRemId: root._id,
      rootTitle: await this.getRemText(root),
      depth: maxDepth,
      maxNodes,
      returned: nodes.length,
      truncated: nodes.length >= maxNodes,
      nodes,
    };
  }

  async exportTagView(params: ExportTagViewParams): Promise<unknown> {
    const tag = await this.plugin.rem.findOne(params.tagRemId);
    if (!tag) throw new Error(`Tag rem not found: ${params.tagRemId}`);
    const limit = this.clampLimit(params.limit, 100, 1000);
    const tagged = await tag.taggedRem();
    const propertyIds = params.propertyIds && params.propertyIds.length > 0
      ? params.propertyIds
      : (params.includeProperties ? (await this.getDirectPropertyChildren(tag)).map((property) => property.remId) : []);

    const rows: Array<Record<string, unknown> & { title: string; createdAt: number; updatedAt: number; localUpdatedAt: number }> = [];
    for (const rem of tagged) {
      const row = await this.getRemSummary(rem) as Record<string, unknown> & { title: string; createdAt: number; updatedAt: number; localUpdatedAt: number };
      if (propertyIds.length > 0) {
        const properties: Record<string, unknown> = {};
        for (const propertyId of propertyIds) {
          properties[propertyId] = await this.serializeForBridge(await rem.getTagPropertyValue(propertyId).catch((err) => ({ error: err instanceof Error ? err.message : String(err) })), 5);
        }
        row.properties = properties;
      }
      rows.push(row);
    }

    const sorted = this.sortRemSummaries(rows, params.sortBy, params.direction);
    return {
      tagRemId: tag._id,
      title: await this.getRemText(tag),
      totalTagged: tagged.length,
      returned: Math.min(limit, sorted.length),
      sortBy: params.sortBy || 'updatedAt',
      direction: params.direction || 'desc',
      propertyIds,
      rows: sorted.slice(0, limit),
    };
  }

  async exportDailyRange(params: ExportDailyRangeParams): Promise<unknown> {
    const start = new Date(`${params.startDate}T00:00:00`);
    const end = new Date(`${params.endDate}T00:00:00`);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
      throw new Error('export_daily_range requires startDate and endDate in YYYY-MM-DD format');
    }
    if (start.getTime() > end.getTime()) {
      throw new Error('export_daily_range startDate must be on or before endDate');
    }

    const maxDays = this.clampLimit(params.maxDays, 31, 366);
    const days: unknown[] = [];
    const cursor = new Date(start);
    while (cursor.getTime() <= end.getTime() && days.length < maxDays) {
      const dailyDoc = await this.plugin.date.getDailyDoc(cursor);
      if (!dailyDoc) throw new Error(`Failed to access daily document for ${cursor.toISOString().slice(0, 10)}`);
      const record: Record<string, unknown> = {
        date: cursor.toISOString().slice(0, 10),
        rem: await this.getRemSummary(dailyDoc, { includeTypeFlags: true }),
      };
      if (params.includeChildren) {
        record.subtree = await this.exportSubtree({
          remId: dailyDoc._id,
          depth: params.depth ?? 2,
          maxNodes: 200,
          includeRelations: false,
        });
      }
      days.push(record);
      cursor.setDate(cursor.getDate() + 1);
    }

    return {
      startDate: params.startDate,
      endDate: params.endDate,
      returnedDays: days.length,
      truncated: cursor.getTime() <= end.getTime(),
      days,
    };
  }

  async exportGraphEdges(params: ExportGraphEdgesParams = {}): Promise<unknown> {
    const maxNodes = this.clampLimit(params.maxNodes, 100, 1000);
    const seeds: PluginRem[] = [];
    const seen = new Set<string>();

    const addSeed = async (remId: string | undefined): Promise<void> => {
      if (!remId || seen.has(remId) || seeds.length >= maxNodes) return;
      const rem = await this.plugin.rem.findOne(remId);
      if (!rem) return;
      seen.add(rem._id);
      seeds.push(rem);
    };

    for (const remId of params.remIds || []) {
      await addSeed(remId);
    }

    if (params.rootRemId) {
      await addSeed(params.rootRemId);
      if (params.includeDescendants) {
        const root = await this.plugin.rem.findOne(params.rootRemId);
        const descendants = root ? await root.getDescendants() : [];
        for (const rem of descendants) {
          await addSeed(rem._id);
          if (seeds.length >= maxNodes) break;
        }
      }
    }

    const nodes = await Promise.all(seeds.map((rem) => this.getRemSummary(rem)));
    const edges: Array<{ from: string; to: string; type: string }> = [];
    const includeTags = params.includeTags ?? true;
    const includeReferences = params.includeReferences ?? true;
    const includeSources = params.includeSources ?? true;
    const includePortals = params.includePortals ?? true;

    for (const rem of seeds) {
      if (rem.parent) edges.push({ from: rem._id, to: rem.parent, type: 'child_of' });
      if (includeTags) {
        for (const tag of await rem.getTagRems().catch(() => [] as PluginRem[])) {
          edges.push({ from: rem._id, to: tag._id, type: 'tagged_with' });
        }
      }
      if (includeReferences) {
        for (const ref of await rem.remsBeingReferenced().catch(() => [] as PluginRem[])) {
          edges.push({ from: rem._id, to: ref._id, type: 'references' });
        }
        for (const ref of await rem.remsReferencingThis().catch(() => [] as PluginRem[])) {
          edges.push({ from: ref._id, to: rem._id, type: 'references' });
        }
      }
      if (includeSources) {
        for (const source of await rem.getSources().catch(() => [] as PluginRem[])) {
          edges.push({ from: rem._id, to: source._id, type: 'has_source' });
        }
      }
      if (includePortals) {
        for (const portal of await rem.portalsAndDocumentsIn().catch(() => [] as PluginRem[])) {
          edges.push({ from: rem._id, to: portal._id, type: 'included_in' });
        }
      }
    }

    return {
      requested: {
        remIds: params.remIds || [],
        rootRemId: params.rootRemId,
        includeDescendants: params.includeDescendants ?? false,
      },
      nodeCount: nodes.length,
      edgeCount: edges.length,
      truncated: seeds.length >= maxNodes,
      nodes,
      edges,
    };
  }

  async remnoteDoctorScan(params: RemNoteDoctorScanParams = {}): Promise<unknown> {
    const limit = this.clampLimit(params.limit, 100, 1000);
    const candidates: PluginRem[] = [];
    const seen = new Set<string>();
    const addCandidate = async (rem: PluginRem | undefined): Promise<void> => {
      if (!rem || seen.has(rem._id) || candidates.length >= limit) return;
      seen.add(rem._id);
      candidates.push(rem);
    };

    for (const remId of params.remIds || []) {
      await addCandidate(await this.plugin.rem.findOne(remId));
    }
    if (params.rootRemId) {
      const root = await this.plugin.rem.findOne(params.rootRemId);
      await addCandidate(root);
      for (const child of root ? await root.getDescendants() : []) {
        await addCandidate(child);
        if (candidates.length >= limit) break;
      }
    }
    if (params.tagRemId) {
      const tag = await this.plugin.rem.findOne(params.tagRemId);
      for (const rem of tag ? await tag.taggedRem() : []) {
        await addCandidate(rem);
        if (candidates.length >= limit) break;
      }
    }
    if (candidates.length === 0) {
      for (const rem of await this.plugin.rem.getAll()) {
        await addCandidate(rem);
        if (candidates.length >= limit) break;
      }
    }

    const issues: Array<Record<string, unknown>> = [];
    for (const rem of candidates) {
      const title = await this.getRemText(rem);
      const children = await rem.getChildrenRem().catch(() => [] as PluginRem[]);
      const blankChildren = [];
      for (const child of children) {
        const childTitle = await this.getRemText(child);
        const [grandChildren, referencesOut] = await Promise.all([
          child.getChildrenRem().catch(() => [] as PluginRem[]),
          child.remsBeingReferenced().catch(() => [] as PluginRem[]),
        ]);
        const hasStructuralRelations = referencesOut.length > 0;
        if (!childTitle.trim() && grandChildren.length === 0 && !hasStructuralRelations) {
          blankChildren.push(child._id);
        }
      }
      if (blankChildren.length > 0) {
        issues.push({
          type: 'blank_direct_children',
          severity: 'warn',
          remId: rem._id,
          title,
          childIds: blankChildren,
          suggestedAction: 'Review and delete if these are not structural property slots.',
        });
      }
      if (params.datePropertyId) {
        const dateValue = await rem.getTagPropertyValue(params.datePropertyId).catch(() => []);
        if (!Array.isArray(dateValue) || dateValue.length === 0) {
          issues.push({
            type: 'missing_date_property',
            severity: 'info',
            remId: rem._id,
            title,
            propertyId: params.datePropertyId,
            suggestedAction: 'Backfill from createdAt using a daily document reference.',
          });
        }
      }
    }

    return {
      readOnly: true,
      mutationApplied: false,
      mode: 'remnote_doctor_scan',
      scanned: candidates.length,
      issueCount: issues.length,
      issues,
    };
  }

  async planRemNoteDoctorRepairs(params: RemNoteDoctorRepairPlanParams = {}): Promise<unknown> {
    const scan = await this.remnoteDoctorScan(params) as Record<string, unknown>;
    const issues = Array.isArray(scan.issues) ? scan.issues as Array<Record<string, unknown>> : [];
    const includeDateBackfill = params.includeDateBackfill !== false;
    const includeBlankChildDeletes = params.includeBlankChildDeletes === true;
    const includeSafeMigrationPlan = params.includeSafeMigrationPlan !== false;
    const maxOperations = this.clampLimit(params.maxOperations, 50, 500);
    const operations: SafeMigrationPlanOperation[] = [];
    const skipped: Array<Record<string, unknown>> = [];

    const pushOperation = (operation: SafeMigrationPlanOperation): boolean => {
      if (operations.length >= maxOperations) return false;
      operations.push(operation);
      return true;
    };

    for (const issue of issues) {
      const type = String(issue.type || '');
      const remId = typeof issue.remId === 'string' ? issue.remId : '';
      if (type === 'missing_date_property') {
        if (!includeDateBackfill) {
          skipped.push({ ...issue, skippedBecause: 'date_backfill_disabled' });
          continue;
        }
        const propertyId = typeof issue.propertyId === 'string'
          ? issue.propertyId
          : (typeof params.datePropertyId === 'string' ? params.datePropertyId : '');
        if (!remId || !propertyId) {
          skipped.push({ ...issue, skippedBecause: 'missing_rem_or_property_id' });
          continue;
        }
        const rem = await this.plugin.rem.findOne(remId);
        if (!rem) {
          skipped.push({ ...issue, skippedBecause: 'rem_not_found' });
          continue;
        }
        const summary = await this.getRemSummary(rem);
        const dateValue = this.formatLocalLearningDate(typeof summary.createdAt === 'number' ? summary.createdAt : undefined);
        if (!dateValue) {
          skipped.push({ ...issue, skippedBecause: 'created_at_missing' });
          continue;
        }
        pushOperation({
          id: `doctor-date-${operations.length + 1}`,
          action: 'set_tag_property_value',
          payload: {
            remId,
            propertyId,
            value: dateValue,
          },
        });
        continue;
      }

      if (type === 'blank_direct_children') {
        const childIds = Array.isArray(issue.childIds) ? issue.childIds.map(String).filter(Boolean) : [];
        if (!includeBlankChildDeletes) {
          skipped.push({ ...issue, skippedBecause: 'blank_child_delete_disabled' });
          continue;
        }
        for (const childId of childIds) {
          const child = await this.plugin.rem.findOne(childId);
          if (!child) {
            skipped.push({ remId: childId, parentRemId: remId, type, skippedBecause: 'child_not_found' });
            continue;
          }
          const childTitle = await this.getRemText(child);
          const [grandChildren, referencesOut] = await Promise.all([
            child.getChildrenRem().catch(() => [] as PluginRem[]),
            child.remsBeingReferenced().catch(() => [] as PluginRem[]),
          ]);
          const hasStructuralRelations = referencesOut.length > 0;
          if (childTitle.trim() || grandChildren.length > 0 || hasStructuralRelations) {
            skipped.push({
              remId: childId,
              parentRemId: remId,
              type,
              skippedBecause: hasStructuralRelations ? 'child_has_structural_relations' : 'child_not_blank_or_has_children',
            });
            continue;
          }
          pushOperation({
            id: `doctor-delete-blank-child-${operations.length + 1}`,
            action: 'delete_note',
            payload: { remId: childId },
          });
        }
      }
    }

    const migrationPlan = includeSafeMigrationPlan
      ? await this.safeMigrationPlan({
        operations,
        maxOperations,
        includeSnapshots: false,
      }) as Record<string, unknown>
      : null;

    return {
      readOnly: true,
      dryRun: true,
      mutationApplied: false,
      mode: 'remnote_doctor_repair_plan',
      source: {
        scanned: scan.scanned,
        issueCount: scan.issueCount,
      },
      defaults: {
        includeDateBackfill,
        includeBlankChildDeletes,
      },
      operationCount: operations.length,
      maxOperations,
      operations,
      skippedCount: skipped.length,
      skipped,
      migrationPlan,
      warnings: [
        'This action does not write to RemNote. Use apply_remnote_doctor_repairs with confirmation after reviewing operations.',
        'Blank-child cleanup is disabled unless includeBlankChildDeletes=true because some blank children can be structural slots.',
      ],
    };
  }

  async applyRemNoteDoctorRepairs(params: ApplyRemNoteDoctorRepairsParams = {}): Promise<unknown> {
    const confirmText = 'APPLY_REMNOTE_DOCTOR_REPAIRS';
    const plan = await this.planRemNoteDoctorRepairs({
      ...params,
      includeSafeMigrationPlan: true,
    }) as Record<string, unknown>;
    const operations = Array.isArray(plan.operations)
      ? plan.operations as SafeMigrationPlanOperation[]
      : [];

    if (params.confirm !== confirmText) {
      return {
        success: false,
        requiresConfirmation: true,
        confirmationText: confirmText,
        readOnly: false,
        dryRun: true,
        mutationApplied: false,
        mode: 'remnote_doctor_repair_apply',
        plannedOperationCount: operations.length,
        reason: 'Confirmation text is required before applying RemNote Doctor repairs.',
        plan,
        warnings: [
          'No RemNote data was changed. Re-run with confirmationText to apply reviewed Doctor repair operations.',
          'Delete operations still require allowDelete=true and allowHighRisk=true through the safe migration gate.',
        ],
      };
    }

    if (operations.length === 0) {
      return {
        success: true,
        readOnly: false,
        dryRun: false,
        mutationApplied: false,
        mode: 'remnote_doctor_repair_apply',
        confirmAccepted: true,
        plannedOperationCount: 0,
        appliedCount: 0,
        failedCount: 0,
        plan,
        applyResult: null,
        warnings: ['No Doctor repair operations were needed.'],
      };
    }

    const applyResult = await this.safeMigrationApply({
      operations,
      maxOperations: params.maxOperations,
      confirm: 'APPLY_SAFE_MIGRATION',
      allowHighRisk: params.allowHighRisk === true,
      allowDelete: params.allowDelete === true,
      stopOnError: params.stopOnError,
      auditMode: 'remnote_doctor_repair_apply',
      auditContext: {
        sourceAction: 'plan_remnote_doctor_repairs',
        issueCount: (plan.source as Record<string, unknown> | undefined)?.issueCount ?? null,
      },
    }) as Record<string, unknown>;

    return {
      success: applyResult.success === true,
      readOnly: false,
      dryRun: false,
      mutationApplied: applyResult.mutationApplied === true,
      mode: 'remnote_doctor_repair_apply',
      confirmAccepted: true,
      plannedOperationCount: operations.length,
      appliedCount: Number(applyResult.appliedCount || 0),
      failedCount: Number(applyResult.failedCount || 0),
      auditId: applyResult.auditId || null,
      plan,
      applyResult,
      warnings: [
        'Doctor repairs were applied through safe_migration_apply only.',
        'Delete rollback is advisory; review the nested applyResult rollbackPlan before chaining reverse actions.',
      ],
    };
  }

  async addTagById(params: { remId: string; tagId: string }): Promise<unknown> {
    const rem = await this.plugin.rem.findOne(params.remId);
    const tag = await this.plugin.rem.findOne(params.tagId);
    if (!rem) throw new Error(`Rem not found: ${params.remId}`);
    if (!tag) throw new Error(`Tag rem not found: ${params.tagId}`);
    await rem.addTag(tag);
    return { success: true, remId: rem._id, tagId: tag._id };
  }

  async removeTagById(params: RemoveTagByIdParams): Promise<unknown> {
    const rem = await this.plugin.rem.findOne(params.remId);
    if (!rem) throw new Error(`Rem not found: ${params.remId}`);
    await rem.removeTag(params.tagId, params.removeProperties ?? false);
    return { success: true, remId: rem._id, tagId: params.tagId, removeProperties: params.removeProperties ?? false };
  }

  async addSourceToRem(params: { remId: string; sourceRemId: string }): Promise<unknown> {
    const rem = await this.plugin.rem.findOne(params.remId);
    const source = await this.plugin.rem.findOne(params.sourceRemId);
    if (!rem) throw new Error(`Rem not found: ${params.remId}`);
    if (!source) throw new Error(`Source rem not found: ${params.sourceRemId}`);
    await rem.addSource(source);
    return { success: true, remId: rem._id, sourceRemId: source._id };
  }

  async removeSourceFromRem(params: { remId: string; sourceRemId: string }): Promise<unknown> {
    const rem = await this.plugin.rem.findOne(params.remId);
    const source = await this.plugin.rem.findOne(params.sourceRemId);
    if (!rem) throw new Error(`Rem not found: ${params.remId}`);
    if (!source) throw new Error(`Source rem not found: ${params.sourceRemId}`);
    await rem.removeSource(source);
    return { success: true, remId: rem._id, sourceRemId: source._id };
  }

  async addRemToPortal(params: { remId: string; portalId: string }): Promise<unknown> {
    const rem = await this.plugin.rem.findOne(params.remId);
    const portal = await this.plugin.rem.findOne(params.portalId);
    if (!rem) throw new Error(`Rem not found: ${params.remId}`);
    if (!portal) throw new Error(`Portal rem not found: ${params.portalId}`);
    await rem.addToPortal(portal);
    return { success: true, remId: rem._id, portalId: portal._id };
  }

  async removeRemFromPortal(params: { remId: string; portalId: string }): Promise<unknown> {
    const rem = await this.plugin.rem.findOne(params.remId);
    const portal = await this.plugin.rem.findOne(params.portalId);
    if (!rem) throw new Error(`Rem not found: ${params.remId}`);
    if (!portal) throw new Error(`Portal rem not found: ${params.portalId}`);
    await rem.removeFromPortal(portal);
    return { success: true, remId: rem._id, portalId: portal._id };
  }

  async createAlias(params: CreateAliasParams): Promise<unknown> {
    const rem = await this.plugin.rem.findOne(params.remId);
    if (!rem) throw new Error(`Rem not found: ${params.remId}`);
    const alias = await rem.getOrCreateAliasWithText(await this.textToRichText(params.aliasText));
    return {
      success: Boolean(alias),
      remId: rem._id,
      alias: alias ? await this.getRemSummary(alias) : null,
    };
  }

  async setPracticeState(params: SetPracticeStateParams): Promise<unknown> {
    const rem = await this.plugin.rem.findOne(params.remId);
    if (!rem) throw new Error(`Rem not found: ${params.remId}`);
    if (typeof params.enablePractice === 'boolean') {
      await rem.setEnablePractice(params.enablePractice);
    }
    if (params.direction) {
      await rem.setPracticeDirection(params.direction);
    }
    return {
      success: true,
      remId: rem._id,
      enablePractice: await rem.getEnablePractice().catch(() => undefined),
      practiceDirection: await rem.getPracticeDirection().catch(() => undefined),
    };
  }

  private async buildPracticeQueueRow(
    rem: PluginRem,
    includeBackText: boolean,
    includeCardDetails: boolean
  ): Promise<Record<string, unknown> | null> {
    const [summary, backTextRaw, isCardItem, enablePractice, practiceDirection, lastPracticed, lastTimeMovedTo, cards] = await Promise.all([
      this.getRemSummary(rem),
      this.getRawRichText(rem, 'backText').catch((err) => ({ error: err instanceof Error ? err.message : String(err) })),
      rem.isCardItem().catch(() => false),
      rem.getEnablePractice().catch(() => undefined),
      rem.getPracticeDirection().catch(() => undefined),
      rem.getLastPracticed().catch(() => undefined),
      rem.getLastTimeMovedTo().catch(() => undefined),
      includeCardDetails
        ? rem.getCards().then((value) => this.serializeForBridge(value, 4)).catch((err) => ({ error: err instanceof Error ? err.message : String(err) }))
        : Promise.resolve(undefined),
    ]);

    const backTextPlain = this.serializedValueToPlainText(backTextRaw).trim();
    const cardCount = Array.isArray(cards) ? cards.length : undefined;
    const isPracticeCandidate = isCardItem === true;
    if (!isPracticeCandidate) {
      return null;
    }

    return {
      ...summary,
      isCardItem,
      enablePractice,
      practiceDirection,
      lastPracticed,
      lastTimeMovedTo,
      cardCount,
      hasBackText: backTextPlain.length > 0,
      ...(includeBackText ? { backTextPlain, backTextRaw } : {}),
      ...(includeCardDetails ? { cards } : {}),
    };
  }

  private cardTypeKey(type: unknown): string {
    if (typeof type === 'string') return type;
    if (type && typeof type === 'object') {
      const record = type as Record<string, unknown>;
      if (typeof record.clozeId === 'string') return 'cloze';
      return JSON.stringify(record);
    }
    return String(type ?? '');
  }

  private async buildCardCatalogRow(
    card: any,
    options: {
      includeRem?: boolean;
      includeRepetitionHistory?: boolean;
      includeRawCard?: boolean;
      valueDepth?: number;
    } = {}
  ): Promise<Record<string, unknown>> {
    const valueDepth = this.clampLimit(options.valueDepth, 4, 8);
    const typeResult = await this.captureSdkRead(() => card.getType(), valueDepth);
    const typeValue = typeResult.ok ? typeResult.value : card.type;
    const repetitionHistory = Array.isArray(card.repetitionHistory) ? card.repetitionHistory : [];
    const row: Record<string, unknown> = {
      cardId: card._id,
      remId: card.remId,
      type: await this.serializeForBridge(typeValue, valueDepth),
      typeKey: this.cardTypeKey(typeValue),
      createdAt: card.createdAt,
      nextRepetitionTime: card.nextRepetitionTime,
      lastRepetitionTime: card.lastRepetitionTime,
      timesWrongInRow: card.timesWrongInRow,
      repetitionHistoryCount: repetitionHistory.length,
      getType: typeResult,
    };

    if (options.includeRepetitionHistory) {
      row.repetitionHistory = await this.serializeForBridge(repetitionHistory, valueDepth);
    }
    if (options.includeRem) {
      row.rem = await this.captureSdkRead(async () => {
        const rem = await card.getRem();
        return rem ? await this.getRemSummary(rem) : undefined;
      }, valueDepth);
    }
    if (options.includeRawCard) {
      row.rawCard = await this.serializeForBridge(card, valueDepth);
    }
    return row;
  }

  async exportCardCatalog(params: ExportCardCatalogParams = {}): Promise<unknown> {
    const limit = this.clampLimit(params.limit, 50, 500);
    const maxScan = this.clampLimit(params.maxScan, 1000, 10000);
    const offset = Math.max(0, Math.floor(params.offset ?? 0));
    const valueDepth = this.clampLimit(params.valueDepth, 4, 8);
    const cards: any[] = [];
    const seen = new Set<string>();
    let mode = 'all';

    const addCard = (card: any | undefined) => {
      if (!card || typeof card._id !== 'string' || seen.has(card._id) || cards.length >= maxScan) return;
      seen.add(card._id);
      cards.push(card);
    };

    if (Array.isArray(params.cardIds) && params.cardIds.length > 0) {
      mode = 'cardIds';
      const ids = params.cardIds.filter((id): id is string => typeof id === 'string' && id.trim().length > 0).slice(0, maxScan);
      if (ids.length === 1) {
        addCard(await (this.plugin as any).card.findOne(ids[0]));
      } else if (ids.length > 1) {
        for (const card of await (this.plugin as any).card.findMany(ids)) addCard(card);
      }
    } else if (Array.isArray(params.remIds) && params.remIds.length > 0) {
      mode = 'remIds';
      for (const remId of params.remIds.slice(0, maxScan)) {
        const rem = await this.plugin.rem.findOne(remId);
        if (!rem) continue;
        for (const card of await rem.getCards().catch(() => [] as any[])) addCard(card);
        if (cards.length >= maxScan) break;
      }
    } else {
      for (const card of await (this.plugin as any).card.getAll()) {
        addCard(card);
        if (cards.length >= maxScan) break;
      }
    }

    const rows: Array<Record<string, unknown>> = [];
    for (const card of cards) {
      const row = await this.buildCardCatalogRow(card, {
        includeRem: params.includeRem,
        includeRepetitionHistory: params.includeRepetitionHistory,
        includeRawCard: params.includeRawCard,
        valueDepth,
      });
      rows.push(row);
    }

    const typeFilter = typeof params.type === 'string' && params.type.trim()
      ? params.type.trim().toLocaleLowerCase('en-US')
      : '';
    const filteredRows = rows.filter((row) => {
      if (typeFilter && String(row.typeKey || '').toLocaleLowerCase('en-US') !== typeFilter) return false;
      const createdAt = typeof row.createdAt === 'number' ? row.createdAt : 0;
      const nextRepetitionTime = typeof row.nextRepetitionTime === 'number' ? row.nextRepetitionTime : 0;
      if (typeof params.createdAfter === 'number' && createdAt < params.createdAfter) return false;
      if (typeof params.createdBefore === 'number' && createdAt > params.createdBefore) return false;
      if (typeof params.dueAfter === 'number' && nextRepetitionTime < params.dueAfter) return false;
      if (typeof params.dueBefore === 'number' && nextRepetitionTime > params.dueBefore) return false;
      return true;
    });

    const sortBy = params.sortBy || 'nextRepetitionTime';
    const direction = params.direction || 'asc';
    const sortedRows = [...filteredRows].sort((a, b) => {
      if (sortBy === 'cardId' || sortBy === 'remId' || sortBy === 'type') {
        const key = sortBy === 'cardId' ? 'cardId' : sortBy === 'type' ? 'typeKey' : sortBy;
        const cmp = String(a[key] || '').localeCompare(String(b[key] || ''), 'en-US');
        return direction === 'desc' ? -cmp : cmp;
      }
      const av = typeof a[sortBy] === 'number' ? Number(a[sortBy]) : Number.MAX_SAFE_INTEGER;
      const bv = typeof b[sortBy] === 'number' ? Number(b[sortBy]) : Number.MAX_SAFE_INTEGER;
      return direction === 'desc' ? bv - av : av - bv;
    });
    const page = sortedRows.slice(offset, offset + limit);

    return {
      readOnly: true,
      mutationApplied: false,
      mode,
      pluginVersion: '2.58.0',
      scanned: cards.length,
      matched: filteredRows.length,
      returned: page.length,
      limit,
      offset,
      maxScan,
      truncated: offset + page.length < filteredRows.length,
      sortBy,
      direction,
      filters: {
        type: typeFilter || undefined,
        dueBefore: params.dueBefore,
        dueAfter: params.dueAfter,
        createdAfter: params.createdAfter,
        createdBefore: params.createdBefore,
      },
      rows: page,
    };
  }

  async readCardFull(params: ReadCardFullParams = {}): Promise<unknown> {
    const valueDepth = this.clampLimit(params.valueDepth, 5, 8);
    const cards: any[] = [];
    if (params.cardId) {
      const card = await (this.plugin as any).card.findOne(params.cardId);
      if (card) cards.push(card);
    } else if (params.remId) {
      const rem = await this.plugin.rem.findOne(params.remId);
      if (!rem) throw new Error(`Rem not found: ${params.remId}`);
      for (const card of await rem.getCards().catch(() => [] as any[])) cards.push(card);
    } else {
      throw new Error('read_card_full requires cardId or remId.');
    }

    const rows = [];
    for (const card of cards) {
      rows.push(await this.buildCardCatalogRow(card, {
        includeRem: params.includeRem !== false,
        includeRepetitionHistory: params.includeRepetitionHistory !== false,
        includeRawCard: params.includeRawCard,
        valueDepth,
      }));
    }

    return {
      readOnly: true,
      mutationApplied: false,
      mode: 'read_card_full',
      pluginVersion: '2.58.0',
      cardId: params.cardId,
      remId: params.remId,
      found: rows.length > 0,
      count: rows.length,
      rows,
    };
  }

  async controlCard(params: ControlCardParams = {}): Promise<unknown> {
    const requestedOperation = params.operation || 'status';
    const operation = requestedOperation === 'updateCardRepetitionStatus'
      ? 'updateRepetitionStatus'
      : requestedOperation;
    const allowedOperations = new Set(['status', 'remove', 'updateRepetitionStatus']);
    if (!allowedOperations.has(operation)) {
      throw new Error(`Unsupported card operation: ${requestedOperation}`);
    }

    const cardId = typeof params.cardId === 'string' ? params.cardId.trim() : '';
    if (!cardId) {
      throw new Error('control_card requires cardId.');
    }

    const valueDepth = this.clampLimit(params.valueDepth, 5, 8);
    const summarize = async (card: any | undefined): Promise<Record<string, unknown> | null> => {
      if (!card) return null;
      return this.buildCardCatalogRow(card, {
        includeRem: params.includeRem !== false,
        includeRepetitionHistory: params.includeRepetitionHistory === true,
        includeRawCard: params.includeRawCard === true,
        valueDepth,
      });
    };

    const card = await (this.plugin as any).card.findOne(cardId);
    const before = await summarize(card);

    if (operation === 'status') {
      return {
        success: true,
        readOnly: true,
        dryRun: true,
        mutationApplied: false,
        mode: 'control_card',
        pluginVersion: '2.58.0',
        operation,
        cardId,
        found: Boolean(card),
        before,
      };
    }

    const confirmationText = 'CONTROL_CARD';
    const score = operation === 'updateRepetitionStatus'
      ? this.normalizeQueueInteractionScore(params.score)
      : undefined;
    const plannedCall = {
      namespace: 'card',
      method: operation === 'remove' ? 'remove' : 'updateCardRepetitionStatus',
      cardId,
      args: operation === 'remove' ? [] : [score],
    };

    if (params.dryRun === true || params.confirm !== confirmationText) {
      return {
        success: false,
        requiresConfirmation: params.dryRun === true ? false : true,
        confirmationText,
        readOnly: params.dryRun === true,
        dryRun: params.dryRun === true,
        mutationApplied: false,
        mode: 'control_card',
        pluginVersion: '2.58.0',
        operation,
        cardId,
        found: Boolean(card),
        reason: params.dryRun === true
          ? 'Dry run only; card action was not executed.'
          : 'Confirmation text is required before mutating a RemNote card.',
        plannedCall,
        before,
      };
    }

    if (!card) {
      return {
        success: false,
        readOnly: false,
        dryRun: false,
        mutationApplied: false,
        mode: 'control_card',
        pluginVersion: '2.58.0',
        operation,
        cardId,
        found: false,
        error: `Card not found: ${cardId}`,
        plannedCall,
        before,
      };
    }

    let success = false;
    let error: string | undefined;
    try {
      if (operation === 'remove') {
        await card.remove();
      } else if (operation === 'updateRepetitionStatus') {
        await card.updateCardRepetitionStatus(score);
      }
      success = true;
    } catch (err) {
      error = err instanceof Error ? err.message : String(err);
    }

    let afterCard: any | undefined;
    try {
      afterCard = await (this.plugin as any).card.findOne(cardId);
    } catch {
      afterCard = undefined;
    }
    const after = await summarize(afterCard);

    return {
      success,
      readOnly: false,
      dryRun: false,
      mutationApplied: success,
      mode: 'control_card',
      pluginVersion: '2.58.0',
      operation,
      cardId,
      foundBefore: Boolean(card),
      foundAfter: Boolean(afterCard),
      plannedCall,
      ...(error ? { error } : {}),
      before,
      after,
    };
  }

  async exportPracticeQueue(params: ExportPracticeQueueParams = {}): Promise<unknown> {
    const limit = this.clampLimit(params.limit, 50, 500);
    const maxScan = this.clampLimit(params.maxScan, 500, 5000);
    const includeBackText = params.includeBackText === true;
    const includeCardDetails = params.includeCardDetails === true;
    const candidates: PluginRem[] = [];
    const seen = new Set<string>();
    let mode = 'all';
    let sourceRemId: string | null = null;

    const addCandidate = async (rem: PluginRem | undefined): Promise<void> => {
      if (!rem || seen.has(rem._id) || candidates.length >= maxScan) return;
      seen.add(rem._id);
      candidates.push(rem);
    };

    if (Array.isArray(params.remIds) && params.remIds.length > 0) {
      mode = 'remIds';
      for (const remId of params.remIds) {
        await addCandidate(await this.plugin.rem.findOne(remId));
      }
    } else if (params.parentId) {
      mode = 'parent';
      const root = await this.plugin.rem.findOne(params.parentId);
      if (!root) throw new Error(`Parent Rem not found: ${params.parentId}`);
      sourceRemId = root._id;
      await addCandidate(root);
      for (const rem of await root.getDescendants().catch(() => [] as PluginRem[])) {
        await addCandidate(rem);
        if (candidates.length >= maxScan) break;
      }
    } else if (params.tagRemId) {
      mode = 'tag';
      const tag = await this.plugin.rem.findOne(params.tagRemId);
      if (!tag) throw new Error(`Tag Rem not found: ${params.tagRemId}`);
      sourceRemId = tag._id;
      for (const rem of await tag.taggedRem().catch(() => [] as PluginRem[])) {
        await addCandidate(rem);
        if (candidates.length >= maxScan) break;
      }
    } else if (params.query && params.query.trim()) {
      mode = 'search';
      const searchResults = await this.plugin.search.search(this.textToPlainRichText(params.query.trim()), undefined, {
        numResults: maxScan,
      });
      for (const rem of searchResults) {
        await addCandidate(rem);
      }
    } else {
      for (const rem of await this.plugin.rem.getAll()) {
        await addCandidate(rem);
        if (candidates.length >= maxScan) break;
      }
    }

    const rows: Array<Record<string, unknown>> = [];
    for (const rem of candidates) {
      const row = await this.buildPracticeQueueRow(rem, includeBackText, includeCardDetails);
      if (row) rows.push(row);
    }

    const sortBy = params.sortBy || 'lastPracticed';
    const direction = params.direction || 'asc';
    const sortedRows = [...rows].sort((a, b) => {
      if (sortBy === 'title') {
        const cmp = String(a.title || '').localeCompare(String(b.title || ''), 'tr');
        return direction === 'desc' ? -cmp : cmp;
      }
      const av = typeof a[sortBy] === 'number' ? Number(a[sortBy]) : 0;
      const bv = typeof b[sortBy] === 'number' ? Number(b[sortBy]) : 0;
      return direction === 'desc' ? bv - av : av - bv;
    });

    return {
      readOnly: true,
      mutationApplied: false,
      mode,
      sourceRemId,
      scanned: candidates.length,
      totalPracticeCandidates: rows.length,
      returned: Math.min(sortedRows.length, limit),
      limit,
      maxScan,
      truncated: sortedRows.length > limit,
      includeBackText,
      includeCardDetails,
      sortBy,
      direction,
      rows: sortedRows.slice(0, limit),
    };
  }

  async exportLearningInbox(params: ExportLearningInboxParams = {}): Promise<unknown> {
    const defaultLearningTagId = 'rkJ9my26ed7F2XIjD';
    const tagId = (params.learningTagId || defaultLearningTagId).trim();
    const tag = await this.plugin.rem.findOne(tagId);
    if (!tag) throw new Error(`Learning tag Rem not found: ${tagId}`);

    const limit = this.clampLimit(params.limit, 50, 500);
    const maxScan = this.clampLimit(params.maxScan, 500, 5000);
    const includeArchived = params.includeArchived === true;
    const includePractice = params.includePractice !== false;
    const includeBackText = params.includeBackText === true;
    const maxPracticeCardsPerRem = this.clampLimit(params.maxPracticeCardsPerRem, 5, 25);
    const tagProperties = await this.getDirectPropertyChildren(tag);

    const resolvePropertyId = (explicitId: string | undefined, candidates: string[]): string | undefined => {
      if (explicitId?.trim()) return explicitId.trim();
      const normalizedCandidates = candidates.map((candidate) => this.normalizeLookupTitle(candidate));
      const exact = tagProperties.find((property) => normalizedCandidates.includes(this.normalizeLookupTitle(property.title)));
      if (exact) return exact.remId;
      const partial = tagProperties.find((property) => {
        const title = this.normalizeLookupTitle(property.title);
        return normalizedCandidates.some((candidate) => title.includes(candidate) || candidate.includes(title));
      });
      return partial?.remId;
    };

    const propertyMap = {
      date: resolvePropertyId(params.datePropertyId, ['Date', 'Created at', 'Learned on']),
      status: resolvePropertyId(params.statusPropertyId, ['Status']),
      priority: resolvePropertyId(params.priorityPropertyId, ['Priority']),
      domain: resolvePropertyId(params.domainPropertyId, ['Domain']),
    };

    const readProperty = async (rem: PluginRem, propertyId: string | undefined): Promise<Record<string, unknown>> => {
      if (!propertyId) return { propertyId: null, raw: [], plain: '' };
      try {
        const raw = await this.serializeForBridge(await rem.getTagPropertyValue(propertyId), 5);
        return {
          propertyId,
          raw,
          plain: this.serializedValueToPlainText(raw).trim(),
        };
      } catch (err) {
        return {
          propertyId,
          raw: [],
          plain: '',
          error: err instanceof Error ? err.message : String(err),
        };
      }
    };

    const collectPracticeRows = async (root: PluginRem): Promise<Array<Record<string, unknown>>> => {
      if (!includePractice) return [];
      const practiceRows: Array<Record<string, unknown>> = [];
      const addPracticeRow = async (rem: PluginRem): Promise<void> => {
        if (practiceRows.length >= maxPracticeCardsPerRem) return;
        const row = await this.buildPracticeQueueRow(rem, includeBackText, false);
        if (row) practiceRows.push(row);
      };

      await addPracticeRow(root);
      if (practiceRows.length >= maxPracticeCardsPerRem) return practiceRows;
      for (const child of await root.getDescendants().catch(() => [] as PluginRem[])) {
        await addPracticeRow(child);
        if (practiceRows.length >= maxPracticeCardsPerRem) break;
      }
      return practiceRows;
    };

    const tagged = await tag.taggedRem().catch(() => [] as PluginRem[]);
    const selected = tagged.slice(0, maxScan);
    const rows: Array<Record<string, unknown> & {
      learnedAt: number;
      title?: string;
      status?: string;
      priority?: string;
      createdAt?: number;
      updatedAt?: number;
      localUpdatedAt?: number;
    }> = [];
    const counts = {
      archived: 0,
      new: 0,
      carded: 0,
      reviewed: 0,
      missingDate: 0,
      missingStatus: 0,
      missingPracticeCards: 0,
      withPracticeCards: 0,
    };

    for (const rem of selected) {
      const summary = await this.getRemSummary(rem);
      const [dateValue, statusValue, priorityValue, domainValue, practiceCards] = await Promise.all([
        readProperty(rem, propertyMap.date),
        readProperty(rem, propertyMap.status),
        readProperty(rem, propertyMap.priority),
        readProperty(rem, propertyMap.domain),
        collectPracticeRows(rem),
      ]);

      const datePlain = String(dateValue.plain || '').trim();
      const status = String(statusValue.plain || '').trim();
      const priority = String(priorityValue.plain || '').trim();
      const domain = String(domainValue.plain || '').trim();
      const normalizedStatus = status.toLocaleLowerCase('tr-TR');
      const archived = normalizedStatus === 'archived' || normalizedStatus.includes('archived');
      if (archived) counts.archived += 1;
      if (!includeArchived && archived) continue;

      const learnedAt = this.parseLearningDateMillis(datePlain, typeof summary.createdAt === 'number' ? summary.createdAt : undefined);
      const issues: string[] = [];
      if (!datePlain) {
        counts.missingDate += 1;
        issues.push('missing_date_property');
      }
      if (!status) {
        counts.missingStatus += 1;
        issues.push('missing_status_property');
      }
      if (normalizedStatus === 'new') counts.new += 1;
      if (normalizedStatus === 'carded') counts.carded += 1;
      if (normalizedStatus === 'reviewed') counts.reviewed += 1;
      if (includePractice && practiceCards.length === 0) {
        counts.missingPracticeCards += 1;
        issues.push('missing_practice_card');
      }
      if (practiceCards.length > 0) counts.withPracticeCards += 1;

      rows.push({
        ...summary,
        learnedAt: learnedAt.value,
        learnedAtIso: learnedAt.value > 0 ? new Date(learnedAt.value).toISOString() : null,
        learnedAtSource: learnedAt.source,
        status,
        priority,
        domain,
        properties: {
          date: dateValue,
          status: statusValue,
          priority: priorityValue,
          domain: domainValue,
        },
        practiceCardCount: practiceCards.length,
        practiceCards,
        issues,
        recommendation: issues.includes('missing_practice_card')
          ? 'Create or attach a practice card for review.'
          : (normalizedStatus === 'new' ? 'Review and decide whether this should become a card.' : 'Ready for review workflow.'),
      });
    }

    const sortBy = params.sortBy || 'learnedAt';
    const direction = params.direction || 'desc';
    const sortedRows = [...rows].sort((a, b) => {
      if (sortBy === 'title' || sortBy === 'status' || sortBy === 'priority') {
        const cmp = String(a[sortBy] || '').localeCompare(String(b[sortBy] || ''), 'tr');
        return direction === 'asc' ? cmp : -cmp;
      }
      const av = typeof a[sortBy] === 'number' ? Number(a[sortBy]) : 0;
      const bv = typeof b[sortBy] === 'number' ? Number(b[sortBy]) : 0;
      return direction === 'asc' ? av - bv : bv - av;
    });

    return {
      readOnly: true,
      mutationApplied: false,
      mode: 'learning_inbox',
      learningTagId: tag._id,
      title: await this.getRemText(tag),
      totalTagged: tagged.length,
      scanned: selected.length,
      returned: Math.min(sortedRows.length, limit),
      limit,
      maxScan,
      truncated: selected.length < tagged.length || sortedRows.length > limit,
      includeArchived,
      includePractice,
      includeBackText,
      sortBy,
      direction,
      propertyMap,
      counts,
      rows: sortedRows.slice(0, limit),
    };
  }

  async planLearningInboxRepairs(params: PlanLearningInboxRepairsParams = {}): Promise<unknown> {
    const inbox = await this.exportLearningInbox({
      ...params,
      includePractice: params.includePractice ?? true,
      includeBackText: params.includeBackText ?? false,
      includeArchived: params.includeArchived ?? false,
    }) as Record<string, unknown>;
    const propertyMap = (inbox.propertyMap || {}) as Record<string, string | undefined>;
    const rows = Array.isArray(inbox.rows) ? inbox.rows as Array<Record<string, unknown>> : [];
    const defaultStatus = params.defaultStatus ?? 'New';
    const defaultPriority = params.defaultPriority ?? 'Medium';
    const defaultDomain = params.defaultDomain ?? '';
    const backfillDateFromCreatedAt = params.backfillDateFromCreatedAt === true;
    const includeSafeMigrationPlan = params.includeSafeMigrationPlan !== false;
    const includeCardDrafts = params.includeCardDrafts !== false;
    const maxOperations = this.clampLimit(params.maxOperations, 100, 500);
    const operations: SafeMigrationPlanOperation[] = [];
    const cardDrafts: Array<Record<string, unknown>> = [];
    const skipped: Array<Record<string, unknown>> = [];

    const addPropertyOperation = (
      row: Record<string, unknown>,
      propertyName: string,
      propertyId: string | undefined,
      value: string,
      reason: string
    ) => {
      const remId = typeof row.remId === 'string' ? row.remId : '';
      if (!value.trim()) return;
      if (!propertyId) {
        skipped.push({
          remId,
          title: row.title,
          reason,
          propertyName,
          skippedBecause: 'property_id_missing',
        });
        return;
      }
      if (!remId || operations.length >= maxOperations) return;
      operations.push({
        id: `learning-${propertyName}-${operations.length + 1}`,
        action: 'set_tag_property_value',
        payload: {
          remId,
          propertyId,
          value,
        },
      });
    };

    for (const row of rows) {
      const issues = Array.isArray(row.issues) ? row.issues.map(String) : [];
      const remId = typeof row.remId === 'string' ? row.remId : '';
      const title = String(row.title || '').trim();
      const status = String(row.status || '').trim();
      const priority = String(row.priority || '').trim();
      const domain = String(row.domain || '').trim();

      if (issues.includes('missing_status_property') || !status) {
        addPropertyOperation(row, 'status', propertyMap.status, defaultStatus, 'missing_status_property');
      }
      if (!priority) {
        addPropertyOperation(row, 'priority', propertyMap.priority, defaultPriority, 'missing_priority_property');
      }
      if (!domain && defaultDomain.trim()) {
        addPropertyOperation(row, 'domain', propertyMap.domain, defaultDomain, 'missing_domain_property');
      }
      if (backfillDateFromCreatedAt && issues.includes('missing_date_property')) {
        const dateValue = this.formatLocalLearningDate(typeof row.createdAt === 'number' ? row.createdAt : undefined);
        addPropertyOperation(row, 'date', propertyMap.date, dateValue, 'missing_date_property');
      }

      if (includeCardDrafts && issues.includes('missing_practice_card')) {
        cardDrafts.push({
          remId,
          title,
          suggestedAction: 'create_flashcard',
          supportedBySafeMigration: false,
          front: title,
          backSuggestion: '',
          reason: 'missing_practice_card',
          note: 'Card creation needs human-written back text or a later explicit create_flashcard apply action.',
        });
      }
    }

    const migrationPlan = includeSafeMigrationPlan
      ? await this.safeMigrationPlan({
        operations,
        maxOperations,
        includeSnapshots: false,
      }) as Record<string, unknown>
      : null;

    return {
      readOnly: true,
      dryRun: true,
      mutationApplied: false,
      mode: 'learning_inbox_repair_plan',
      source: {
        learningTagId: inbox.learningTagId,
        title: inbox.title,
        totalTagged: inbox.totalTagged,
        scanned: inbox.scanned,
        inboxReturned: inbox.returned,
        counts: inbox.counts,
        propertyMap,
      },
      defaults: {
        defaultStatus,
        defaultPriority,
        defaultDomain,
        backfillDateFromCreatedAt,
      },
      operationCount: operations.length,
      maxOperations,
      operations,
      skippedCount: skipped.length,
      skipped,
      cardDraftCount: cardDrafts.length,
      cardDrafts,
      migrationPlan,
      warnings: [
        'This action does not write to RemNote. Apply property operations through safe_migration_apply after review.',
        'Card drafts are suggestions only; create_flashcard needs a reviewed back side before applying.',
      ],
    };
  }

  async applyLearningInboxRepairs(params: ApplyLearningInboxRepairsParams = {}): Promise<unknown> {
    const confirmText = 'APPLY_LEARNING_INBOX_REPAIRS';
    const plan = await this.planLearningInboxRepairs({
      ...params,
      includeSafeMigrationPlan: true,
      includeCardDrafts: params.includeCardDrafts ?? true,
    }) as Record<string, unknown>;
    const operations = Array.isArray(plan.operations)
      ? plan.operations as SafeMigrationPlanOperation[]
      : [];
    const cardDrafts = Array.isArray(plan.cardDrafts)
      ? plan.cardDrafts as Array<Record<string, unknown>>
      : [];

    if (params.confirm !== confirmText) {
      return {
        success: false,
        requiresConfirmation: true,
        confirmationText: confirmText,
        readOnly: false,
        dryRun: true,
        mutationApplied: false,
        mode: 'learning_inbox_repair_apply',
        plannedOperationCount: operations.length,
        cardDraftCount: cardDrafts.length,
        reason: 'Confirmation text is required before applying Learning Inbox property repairs.',
        plan,
        warnings: [
          'No RemNote data was changed. Re-run with confirmationText to apply property-only repairs.',
          'Card drafts are not applied by this action; they remain suggestions for reviewed flashcard creation.',
        ],
      };
    }

    if (operations.length === 0) {
      return {
        success: true,
        readOnly: false,
        dryRun: false,
        mutationApplied: false,
        mode: 'learning_inbox_repair_apply',
        confirmAccepted: true,
        plannedOperationCount: 0,
        appliedCount: 0,
        failedCount: 0,
        cardDraftCount: cardDrafts.length,
        plan,
        applyResult: null,
        warnings: [
          'No property repair operations were needed.',
          'Card drafts are not applied by this action; they remain suggestions for reviewed flashcard creation.',
        ],
      };
    }

    const applyResult = await this.safeMigrationApply({
      operations,
      maxOperations: params.maxOperations,
      confirm: 'APPLY_SAFE_MIGRATION',
      allowHighRisk: false,
      allowDelete: false,
      stopOnError: params.stopOnError,
      auditMode: 'learning_inbox_repair_apply',
      auditContext: {
        sourceAction: 'plan_learning_inbox_repairs',
        learningTagId: (plan.source as Record<string, unknown> | undefined)?.learningTagId || params.learningTagId || null,
        cardDraftCount: cardDrafts.length,
      },
    }) as Record<string, unknown>;

    return {
      success: applyResult.success === true,
      readOnly: false,
      dryRun: false,
      mutationApplied: applyResult.mutationApplied === true,
      mode: 'learning_inbox_repair_apply',
      confirmAccepted: true,
      plannedOperationCount: operations.length,
      appliedCount: Number(applyResult.appliedCount || 0),
      failedCount: Number(applyResult.failedCount || 0),
      auditId: applyResult.auditId || null,
      cardDraftCount: cardDrafts.length,
      plan,
      applyResult,
      warnings: [
        'Only property repairs were applied through safe_migration_apply.',
        'Card drafts are not applied by this action; they remain suggestions for reviewed flashcard creation.',
      ],
    };
  }

  async setTableFilterRaw(params: SetTableFilterRawParams): Promise<unknown> {
    const rem = await this.plugin.rem.findOne(params.remId);
    if (!rem) throw new Error(`Table rem not found: ${params.remId}`);
    const isTable = await rem.isTable();
    if (!isTable) throw new Error(`Rem is not a table: ${params.remId}`);
    if (params.dryRun ?? false) {
      return { success: false, dryRun: true, remId: rem._id, wouldSetFilter: params.filter ?? null };
    }
    if (!params.filter || typeof params.filter !== 'object') {
      throw new Error('set_table_filter_raw requires payload.filter object unless dryRun=true');
    }
    await rem.setTableFilter(params.filter as any);
    return { success: true, remId: rem._id };
  }

  async getIndexedDbInventory(params: IndexedDbInventoryParams = {}): Promise<unknown> {
    let databases: Array<{ name: string; version?: number }>;
    try {
      databases = await this.getIndexedDbDatabases();
    } catch (err) {
      return {
        supported: false,
        readOnly: true,
        error: err instanceof Error ? err.message : String(err),
        databases: [],
        databaseCount: 0,
      };
    }

    const includeCounts = params.includeCounts ?? true;
    const includeSamples = params.includeSamples ?? false;
    const sampleLimit = this.clampLimit(params.sampleLimit, 3, 25);
    const valueDepth = this.clampLimit(params.valueDepth, 3, 8);
    const selected = params.databaseName
      ? databases.filter((entry) => entry.name === params.databaseName)
      : databases;

    const rows: Array<Record<string, unknown>> = [];
    for (const dbInfo of selected) {
      let db: IDBDatabase | null = null;
      try {
        db = await this.openExistingIndexedDb(dbInfo.name);
        const storeNames = Array.from(db.objectStoreNames);
        const stores: Array<Record<string, unknown>> = [];
        for (const storeName of storeNames) {
          const storeRecord: Record<string, unknown> = { name: storeName };
          if (includeCounts) {
            try {
              storeRecord.count = await this.countIndexedDbStore(db, storeName);
            } catch (err) {
              storeRecord.countError = err instanceof Error ? err.message : String(err);
            }
          }
          if (includeSamples) {
            try {
              storeRecord.sample = await this.readIndexedDbStoreRows(db, storeName, {
                limit: sampleLimit,
                offset: 0,
                includeValues: true,
                valueDepth,
              });
            } catch (err) {
              storeRecord.sampleError = err instanceof Error ? err.message : String(err);
            }
          }
          stores.push(storeRecord);
        }
        rows.push({
          name: dbInfo.name,
          version: db.version || dbInfo.version,
          storeCount: storeNames.length,
          objectStoreNames: storeNames,
          stores,
        });
      } catch (err) {
        rows.push({
          name: dbInfo.name,
          version: dbInfo.version,
          error: err instanceof Error ? err.message : String(err),
        });
      } finally {
        try {
          db?.close();
        } catch {
        }
      }
    }

    return {
      supported: true,
      readOnly: true,
      mode: 'indexeddb_inventory',
      databaseCount: databases.length,
      returned: rows.length,
      filteredByDatabaseName: params.databaseName || null,
      includeCounts,
      includeSamples,
      databases: rows,
    };
  }

  async readIndexedDbStore(params: IndexedDbReadStoreParams): Promise<unknown> {
    if (!params.databaseName?.trim()) {
      throw new Error('indexeddb_read_store requires databaseName');
    }
    if (!params.storeName?.trim()) {
      throw new Error('indexeddb_read_store requires storeName');
    }

    const limit = this.clampLimit(params.limit, 50, 5000);
    const offset = Math.max(0, Math.floor(params.offset || 0));
    const includeValues = params.includeValues ?? true;
    const valueDepth = this.clampLimit(params.valueDepth, 4, 10);
    let db: IDBDatabase | null = null;
    try {
      db = await this.openExistingIndexedDb(params.databaseName);
      const storeNames = Array.from(db.objectStoreNames);
      if (!storeNames.includes(params.storeName)) {
        throw new Error(`IndexedDB store not found: ${params.databaseName}/${params.storeName}`);
      }
      const totalCount = await this.countIndexedDbStore(db, params.storeName).catch(() => undefined);
      const rows = await this.readIndexedDbStoreRows(db, params.storeName, {
        limit,
        offset,
        includeValues,
        valueDepth,
      });
      return {
        supported: true,
        readOnly: true,
        mode: 'indexeddb_read_store',
        databaseName: params.databaseName,
        storeName: params.storeName,
        totalCount,
        offset,
        limit,
        returned: rows.length,
        includeValues,
        valueDepth,
        rows,
      };
    } finally {
      try {
        db?.close();
      } catch {
      }
    }
  }

  /**
   * Set a property value for a tagged row rem.
   */
  async setTagPropertyValue(params: SetTagPropertyValueParams): Promise<{ success: boolean; remId: string; propertyId: string }> {
    const rem = await this.plugin.rem.findOne(params.remId);
    if (!rem) {
      throw new Error(`Row rem not found: ${params.remId}`);
    }

    const property = await this.plugin.rem.findOne(params.propertyId);
    if (!property) {
      throw new Error(`Property rem not found: ${params.propertyId}`);
    }

    const value = typeof params.value === 'string' ? params.value : '';
    if (!value.trim()) {
      await rem.setTagPropertyValue(property._id, undefined);
    } else {
      await rem.setTagPropertyValue(property._id, await this.textToRichText(value));
    }

    return { success: true, remId: rem._id, propertyId: property._id };
  }

  /**
   * Get plugin status
   */
  async getStatus(): Promise<{
    connected: boolean;
    pluginVersion: string;
    knowledgeBaseId?: string;
  }> {
    return {
      connected: true,
      pluginVersion: '2.58.0',
      knowledgeBaseId: undefined
    };
  }

  async listChildren(params: ListChildrenParams): Promise<{
    remId: string;
    title: string;
    count: number;
    children: Array<{ remId: string; title: string }>;
  }> {
    const rem = await this.plugin.rem.findOne(params.remId);
    if (!rem) {
      throw new Error(`Rem not found: ${params.remId}`);
    }

    const children = await rem.getChildrenRem();
    const limit = Math.max(1, params.limit ?? 100);
    const rows = [];
    for (const child of children.slice(0, limit)) {
      rows.push({
        remId: child._id,
        title: await this.getRemText(child)
      });
    }

    return {
      remId: rem._id,
      title: await this.getRemText(rem),
      count: children.length,
      children: rows
    };
  }

  /**
   * Find or create a nested path of RemNote documents.
   */
  async findOrCreatePath(params: {
    pathSegments: string[];
    rootParentId?: string;
    createMissing?: boolean;
    asFolders?: boolean;
  }): Promise<{ remId: string; path: string[] }> {
    const segments = (params.pathSegments || []).filter(Boolean);
    if (segments.length === 0) throw new Error('pathSegments must not be empty');

    let parentRem: PluginRem | undefined;

    if (params.rootParentId) {
      const root = params.rootParentId.trim();
      if (this.isUUID(root)) {
        parentRem = await this.plugin.rem.findOne(root);
      }
      if (!parentRem) {
        const variants = this.buildNameVariants(root);
        for (const v of variants) {
          parentRem = await this.plugin.rem.findByName([v], null);
          if (parentRem) break;
        }
      }
    }

    let current: PluginRem | undefined = parentRem;
    for (const seg of segments) {
      const variants = this.buildNameVariants(seg);
      let found: PluginRem | undefined;
      for (const v of variants) {
        found = await this.plugin.rem.findByName([v], current?._id ?? null);
        if (found) break;
      }
      if (!found) {
        if (params.createMissing === false) {
          throw new Error(`Path segment not found: ${seg}`);
        }
        found = await this.plugin.rem.createRem();
        if (!found) throw new Error(`Failed to create rem for segment: ${seg}`);
        await found.setText(this.textToPlainRichText(seg));
        await found.setIsDocument(true);
        if (params.asFolders) await found.setIsFolder(true);
        if (current) await found.setParent(current);
      }
      current = found;
    }

    if (!current) throw new Error('Could not resolve path');
    return { remId: current._id, path: segments };
  }

  /**
   * Upsert a structured note (create or update based on title match).
   */
  async upsertStructuredNote(params: {
    title: string;
    parentId?: string;
    pathSegments?: string[];
    rootParentId?: string;
    headingLevel?: number;
    tags?: string[];
    mergeStrategy?: 'overwrite_if_exact_title' | 'append_sections';
    metadata?: Record<string, string>;
    sections: Array<{ heading: string; body: string; imageUrls?: string[] }>;
  }): Promise<{ remId: string; title: string; status: 'created' | 'updated' }> {
    const title = (params.title || '').trim();
    if (!title) throw new Error('title is required');

    // Resolve effective parentId from path or parentId
    let effectiveParentId = params.parentId;
    if (params.pathSegments && params.pathSegments.length > 0) {
      const pathResult = await this.findOrCreatePath({
        pathSegments: params.pathSegments,
        rootParentId: params.rootParentId,
        createMissing: true,
        asFolders: true
      });
      effectiveParentId = pathResult.remId;
    }

    // Try to find existing rem with this title under the parent
    let existingRem: PluginRem | undefined;
    const variants = this.buildNameVariants(title);
    for (const v of variants) {
      existingRem = await this.plugin.rem.findByName([v], effectiveParentId ?? null);
      if (existingRem) break;
    }

    if (!existingRem && !effectiveParentId) {
      for (const v of variants) {
        const results = await this.plugin.search.search(this.textToPlainRichText(v), undefined, { numResults: 1 });
        if (results && results.length > 0) { existingRem = results[0]; break; }
      }
    }

    const strategy = params.mergeStrategy || 'overwrite_if_exact_title';

    if (existingRem) {
      // Update existing
      if (strategy === 'overwrite_if_exact_title') {
        const existingChildren = await existingRem.getChildrenRem();
        for (const c of existingChildren) await c.remove();
      }
      for (const section of params.sections || []) {
        const headingText = (section.heading || '').trim();
        const bodyText = (section.body || '').trim();
        const imageUrls = this.normalizeImageUrls(section.imageUrls);
        if (!headingText && !bodyText && imageUrls.length === 0) continue;
        const headerRem = await this.plugin.rem.createRem();
        if (!headerRem) continue;
        await headerRem.setText(await this.textToRichText(`***${headingText || 'Section'}***`));
        await headerRem.setParent(existingRem);
        if (bodyText) {
          const bodyRem = await this.plugin.rem.createRem();
          if (bodyRem) {
            await bodyRem.setText(await this.textToRichText(bodyText));
            await bodyRem.setParent(headerRem);
          }
        }
        await this.appendImageRems(headerRem, imageUrls);
      }
      return { remId: existingRem._id, title: await this.getRemText(existingRem), status: 'updated' };
    }

    // Create new
    const created = await this.createStructuredSummary({
      title,
      parentId: effectiveParentId,
      headingLevel: params.headingLevel,
      tags: params.tags,
      sections: params.sections.map((s) => ({
        heading: s.heading,
        body: s.body,
        imageUrls: s.imageUrls
      }))
    });

    return { remId: created.remId, title: created.title || title, status: 'created' };
  }

  /**
   * Batch ingest multiple records.
   */
  async batchIngestRecords(params: {
    records: Array<{
      title: string;
      parentId?: string;
      pathSegments?: string[];
      rootParentId?: string;
      headingLevel?: number;
      tags?: string[];
      mergeStrategy?: 'overwrite_if_exact_title' | 'append_sections';
      metadata?: Record<string, string>;
      sections: Array<{ heading: string; body: string; imageUrls?: string[] }>;
    }>;
  }): Promise<{ results: Array<{ remId: string; title: string; status: string }> }> {
    const results = [];
    for (const record of params.records || []) {
      try {
        const r = await this.upsertStructuredNote(record);
        results.push(r);
      } catch (e) {
        results.push({ remId: '', title: record.title, status: `error: ${(e as Error).message}` });
      }
    }
    return { results };
  }

  // -- SIDEBAR SHORTCUTS (SDK v0.0.46 has no native sidebar pin API) ------------
  // We emulate a pinned-docs list via plugin.storage.setSynced/getSynced.
  // The MCP can read/write this list. Opening a pinned doc still requires
  // a separate open_note action; this is a persistent bookmark store only.

  private readonly SIDEBAR_STORAGE_KEY = 'mcp_sidebar_shortcuts_v1';

  private async readSidebarShortcutsFromStorage(): Promise<Array<{ remId: string; title: string; icon?: string; description?: string }>> {
    const stored = await this.plugin.storage.getSynced<Array<{ remId: string; title: string; icon?: string; description?: string }>>(this.SIDEBAR_STORAGE_KEY);
    return Array.isArray(stored) ? stored : [];
  }

  /**
   * Get sidebar shortcuts â€” reads from synced plugin storage.
   * Native SDK sidebar pin API does not exist in v0.0.46.
   * Use open_note to navigate to a pinned doc.
   */
  async getSidebarShortcuts(): Promise<{ shortcuts: Array<{ remId: string; title: string; icon?: string; description?: string }> }> {
    const shortcuts = await this.readSidebarShortcutsFromStorage();
    return { shortcuts };
  }

  /**
   * Replace the entire sidebar shortcut list.
   */
  async setSidebarShortcuts(params: { shortcuts: Array<{ remId: string; title?: string; icon?: string; description?: string }> }): Promise<{ ok: boolean; count: number }> {
    const shortcuts = (params.shortcuts || []).map((s) => ({
      remId: s.remId,
      title: s.title || s.remId,
      ...(s.icon ? { icon: s.icon } : {}),
      ...(s.description ? { description: s.description } : {}),
    }));
    await this.plugin.storage.setSynced(this.SIDEBAR_STORAGE_KEY, shortcuts);
    return { ok: true, count: shortcuts.length };
  }

  /**
   * Add a single sidebar shortcut. Auto-resolves title from RemNote if not provided.
   * Deduplicates by remId.
   */
  async addSidebarShortcut(params: { remId: string; title?: string; icon?: string; description?: string }): Promise<{ ok: boolean; remId: string; count: number }> {
    const existing = await this.readSidebarShortcutsFromStorage();

    // Resolve title if not provided
    let title = params.title || '';
    if (!title) {
      try {
        const rem = await this.plugin.rem.findOne(params.remId);
        if (rem) title = await this.getRemText(rem);
      } catch {
        // ignore â€” use remId as fallback
      }
      if (!title) title = params.remId;
    }

    // Deduplicate
    const filtered = existing.filter((s) => s.remId !== params.remId);
    const updated = [
      ...filtered,
      {
        remId: params.remId,
        title,
        ...(params.icon ? { icon: params.icon } : {}),
        ...(params.description ? { description: params.description } : {}),
      }
    ];
    await this.plugin.storage.setSynced(this.SIDEBAR_STORAGE_KEY, updated);
    return { ok: true, remId: params.remId, count: updated.length };
  }

  /**
   * Remove a sidebar shortcut by remId.
   */
  async removeSidebarShortcut(params: { remId: string }): Promise<{ ok: boolean; remId: string; count: number }> {
    const existing = await this.readSidebarShortcutsFromStorage();
    const updated = existing.filter((s) => s.remId !== params.remId);
    await this.plugin.storage.setSynced(this.SIDEBAR_STORAGE_KEY, updated);
    return { ok: true, remId: params.remId, count: updated.length };
  }

  /**
   * Inject CSS into the RemNote UI using plugin.app.registerCSS.
   * This affects the entire RemNote interface, not just the plugin widget.
   * Use a stable id to overwrite previously injected CSS with the same id.
   */
  async injectCSS(params: {
    id: string;
    css: string;
  }): Promise<{ ok: boolean; id: string; bytes: number }> {
    const cssId = (params.id || 'mcp-custom-css').trim();
    const cssText = (params.css || '').trim();
    if (!cssText) {
      throw new Error('inject_css requires non-empty css');
    }
    await this.plugin.app.registerCSS(cssId, cssText);
    return { ok: true, id: cssId, bytes: cssText.length };
  }

  async discoverTables(minRows = 3): Promise<{ ok: boolean; minRows: number; tables: Array<unknown> }> {
    return { ok: true, minRows, tables: [] };
  }

  async smartCountTable(query: string): Promise<{ ok: boolean; query: string; count: number; strategy: string }> {
    return { ok: true, query, count: 0, strategy: 'stub' };
  }

  // -- NEW METHODS (v2.1.0 â€” Antigravity Enhanced) --------------------------

  /**
   * Create a proper flashcard using RemNote SDK (not just text formatting).
   * Uses setBackText for true flashcard behavior in the SRS queue.
   */
  async createFlashcard(params: CreateFlashcardParams): Promise<{ remId: string; front: string; back: string; type: string }> {
    const rem = await this.plugin.rem.createRem();
    if (!rem) throw new Error('Failed to create flashcard Rem');

    // Set front text
    await rem.setText(await this.textToRichText(params.front));

    // Set back text â€” this is what makes it a REAL flashcard
    await rem.setBackText(await this.textToRichText(params.back));

    // Activate as card item in the SRS queue
    await rem.setIsCardItem(true);

    // Card direction: SDK v0.0.46 does not expose a direct direction setter.
    // setBackText already creates a forward card. For backward/bidirectional,
    // we swap front/back or duplicate the card.
    const type = params.type || 'forward';
    if (type === 'backward') {
      // Swap: back becomes front, front becomes back
      await rem.setText(await this.textToRichText(params.back));
      await rem.setBackText(await this.textToRichText(params.front));
    } else if (type === 'bidirectional') {
      // Create a second card with swapped sides under same parent
      const reverseRem = await this.plugin.rem.createRem();
      if (reverseRem) {
        await reverseRem.setText(await this.textToRichText(params.back));
        await reverseRem.setBackText(await this.textToRichText(params.front));
        await reverseRem.setIsCardItem(true);
        if (params.parentId) {
          const parent = await this.plugin.rem.findOne(params.parentId);
          if (parent) await reverseRem.setParent(parent);
        }
        for (const tagName of (params.tags || [])) {
          await this.addTagToRem(reverseRem, tagName);
        }
      }
    }

    // Set parent
    if (params.parentId) {
      const parent = await this.plugin.rem.findOne(params.parentId);
      if (parent) await rem.setParent(parent);
    }

    // Add extra card detail as child
    if (params.extraDetail) {
      const detailRem = await this.plugin.rem.createRem();
      if (detailRem) {
        await detailRem.setText(await this.textToRichText(params.extraDetail));
        await detailRem.setParent(rem);
        // Tag as extra card detail power-up
        try {
          await detailRem.addPowerup('e');  // BuiltInPowerupCodes for ExtraCardDetail
        } catch (e) {
          console.warn('Could not add ExtraCardDetail powerup', e);
        }
      }
    }

    if (params.detailToggles && params.detailToggles.length > 0) {
      for (let i = 0; i < params.detailToggles.length; i++) {
        await this.createFlashcardDetailToggle(rem, params.detailToggles[i], i);
      }
    }

    // Add tags
    for (const tagName of (params.tags || [])) {
      await this.addTagToRem(rem, tagName);
    }

    // Auto-tag
    if (this.settings.autoTagEnabled && this.settings.autoTag) {
      await this.addTagToRem(rem, this.settings.autoTag);
    }

    return { remId: rem._id, front: params.front, back: params.back, type };
  }

  async updateFlashcardBack(params: UpdateFlashcardBackParams): Promise<{ success: boolean; remId: string; back: string }> {
    const rem = await this.plugin.rem.findOne(params.remId);
    if (!rem) throw new Error(`Flashcard Rem not found: ${params.remId}`);
    await rem.setBackText(await this.textToRichText(params.back));
    await rem.setIsCardItem(true);
    return { success: true, remId: rem._id, back: params.back };
  }

  /**
   * Build rich text with real cloze deletion elements from {{marker}} syntax.
   *
   * RemNote cloze format: RichTextFormatName includes 'cloze'.
   * We parse each {{...}} span and apply applyTextFormatToRange('cloze') on it.
   * The resulting richText array has hidden-cloze formatted segments.
   */
  private async buildClozeRichText(text: string): Promise<RichTextInterface> {
    // First build plain rich text from the full text (stripping {{ and }})
    // Strategy: split by {{...}}, build a flat string without markers, track char ranges
    const OPEN = '{{';
    const CLOSE = '}}';
    let plain = '';
    const clozeRanges: Array<{ start: number; end: number }> = [];
    let i = 0;

    while (i < text.length) {
      const openIdx = text.indexOf(OPEN, i);
      if (openIdx === -1) {
        plain += text.slice(i);
        break;
      }
      // text before marker
      plain += text.slice(i, openIdx);
      const closeIdx = text.indexOf(CLOSE, openIdx + OPEN.length);
      if (closeIdx === -1) {
        // unclosed marker â€” treat rest as plain
        plain += text.slice(openIdx);
        break;
      }
      const clozeContent = text.slice(openIdx + OPEN.length, closeIdx);
      const start = plain.length;
      plain += clozeContent;
      clozeRanges.push({ start, end: plain.length });
      i = closeIdx + CLOSE.length;
    }

    if (clozeRanges.length === 0) {
      // No cloze markers found â€” return plain text
      return this.textToPlainRichText(text);
    }

    // Build plain rich text, then apply cloze format to each range
    let richText: RichTextInterface = this.textToPlainRichText(plain);
    for (const range of clozeRanges) {
      try {
        richText = await this.plugin.richText.applyTextFormatToRange(richText, range.start, range.end, 'cloze');
      } catch (e) {
        console.warn('[MCP Bridge] buildClozeRichText: applyTextFormatToRange cloze failed for range', range, e);
      }
    }
    return richText;
  }

  /**
   * Create a cloze deletion flashcard.
   * Text with {{cloze}} markers becomes a real fill-in-the-blank card.
   * Uses SDK applyTextFormatToRange with 'cloze' format â€” no plain-text workaround.
   */
  async createClozeFlashcard(params: {
    parentId: string;
    text: string;
    tags?: string[];
  }): Promise<{ remId: string; text: string; clozeCount: number }> {
    const rem = await this.plugin.rem.createRem();
    if (!rem) throw new Error('Failed to create cloze Rem');

    // Count cloze markers before stripping them (for return value)
    const clozeCount = (params.text.match(/\{\{/g) || []).length;

    // Build rich text with real cloze elements
    const richText = await this.buildClozeRichText(params.text);
    await rem.setText(richText);

    // Mark as card item so it enters the SRS queue
    await rem.setIsCardItem(true);

    // Set parent
    if (params.parentId) {
      const parent = await this.plugin.rem.findOne(params.parentId);
      if (parent) await rem.setParent(parent);
    }

    // Add tags
    for (const tagName of (params.tags || [])) {
      await this.addTagToRem(rem, tagName);
    }

    // Auto-tag
    if (this.settings.autoTagEnabled && this.settings.autoTag) {
      await this.addTagToRem(rem, this.settings.autoTag);
    }

    return { remId: rem._id, text: params.text, clozeCount };
  }

  /**
   * Add a built-in Power-Up to a Rem.
   * Power-ups add special behavior: todo checkbox, highlight, edit-later, etc.
   */
  async addPowerup(params: {
    remId: string;
    powerup: string;
  }): Promise<{ success: boolean; remId: string; powerup: string }> {
    const rem = await this.plugin.rem.findOne(params.remId);
    if (!rem) throw new Error(`Note not found: ${params.remId}`);
    const blankChildrenBefore = await this.getBlankDirectChildIds(rem);

    // Map friendly names to BuiltInPowerupCodes
    const powerupMap: Record<string, string> = {
      'todo': 't',
      'highlight': 'h',
      'highlight-red': 'hr',
      'highlight-orange': 'ho',
      'highlight-yellow': 'hy',
      'highlight-green': 'hg',
      'highlight-blue': 'hb',
      'highlight-purple': 'hp',
      'edit-later': 'l',
      'suspend-cards': 's',
      'extra-card-detail': 'e',
      'auto-sort': 'as',
      'header-1': 'h1',
      'header-2': 'h2',
      'header-3': 'h3',
      'document': 'd',
      'quote': 'q',
      'code-block': 'cb',
    };

    const code = powerupMap[params.powerup] || params.powerup;

    try {
      await rem.addPowerup(code);
    } catch (e) {
      // Fallback: try as-is if mapping didn't work
      console.warn(`Powerup code "${code}" failed, trying raw: "${params.powerup}"`, e);
      await rem.addPowerup(params.powerup);
    }
    await this.removeNewBlankDirectChildren(rem, blankChildrenBefore);

    return { success: true, remId: params.remId, powerup: params.powerup };
  }

  /**
   * Remove a Power-Up from a Rem.
   */
  async removePowerup(params: {
    remId: string;
    powerup: string;
  }): Promise<{ success: boolean; remId: string }> {
    const rem = await this.plugin.rem.findOne(params.remId);
    if (!rem) throw new Error(`Note not found: ${params.remId}`);

    const powerupMap: Record<string, string> = {
      'todo': 't', 'highlight': 'h', 'edit-later': 'l',
      'suspend-cards': 's', 'extra-card-detail': 'e', 'auto-sort': 'as',
    };
    const code = powerupMap[params.powerup] || params.powerup;
    await rem.removePowerup(code);

    return { success: true, remId: params.remId };
  }

  /**
   * Create a portal â€” embed one Rem inside another.
   * The portal shows live content that syncs across all locations.
   */
  async createPortal(params: {
    parentId: string;
    sourceRemId: string;
  }): Promise<{ success: boolean; parentId: string; sourceRemId: string; portalRemId?: string }> {
    const parent = await this.plugin.rem.findOne(params.parentId);
    if (!parent) throw new Error(`Parent not found: ${params.parentId}`);

    const source = await this.plugin.rem.findOne(params.sourceRemId);
    if (!source) throw new Error(`Source Rem not found: ${params.sourceRemId}`);

    // Create portal by adding source as a portal child of parent
    const portalRem = await this.plugin.rem.createPortal();
    if (portalRem) {
      await portalRem.setParent(parent);
      // Add the source rem inside the portal
      const sourceRef = await this.plugin.rem.createRem();
      if (sourceRef) {
        await sourceRef.setText([{ i: 'q', _id: source._id }] as any);
        await sourceRef.setParent(portalRem);
      }
    }

    return { success: true, parentId: params.parentId, sourceRemId: params.sourceRemId, portalRemId: portalRem?._id };
  }

  /**
   * Create a reference link to another Rem inside a note's text.
   */
  async createReference(params: {
    remId: string;
    text: string;
    targetRemId: string;
  }): Promise<{ success: boolean; remId: string; targetRemId: string }> {
    const rem = await this.plugin.rem.findOne(params.remId);
    if (!rem) throw new Error(`Note not found: ${params.remId}`);

    const target = await this.plugin.rem.findOne(params.targetRemId);
    if (!target) throw new Error(`Target Rem not found: ${params.targetRemId}`);

    // Build rich text with reference
    const richText: RichTextInterface = [
      params.text + ' ',
      { i: 'q', _id: target._id } as any,
    ];
    await rem.setText(richText);

    return { success: true, remId: params.remId, targetRemId: params.targetRemId };
  }

  /**
   * Get today's daily document (or create if not exists).
   */
  async getDailyDoc(params: {
    date?: string;
  }): Promise<{ remId: string; title: string; date: string }> {
    const targetDate = params.date ? new Date(params.date) : new Date();
    const dailyDoc = await this.plugin.date.getDailyDoc(targetDate);

    if (!dailyDoc) {
      throw new Error('Failed to access daily document');
    }

    const title = await this.getRemText(dailyDoc);
    const isoDate = targetDate.toISOString().split('T')[0];

    return { remId: dailyDoc._id, title, date: isoDate };
  }

  /**
   * Get all tags on a Rem.
   */
  async getRemTags(params: {
    remId: string;
  }): Promise<{ remId: string; tags: Array<{ tagId: string; tagName: string }> }> {
    const rem = await this.plugin.rem.findOne(params.remId);
    if (!rem) throw new Error(`Note not found: ${params.remId}`);

    const tagRems = await rem.getTagRems();
    const tags = [];
    for (const tagRem of tagRems) {
      const tagName = await this.getRemText(tagRem);
      tags.push({ tagId: tagRem._id, tagName });
    }

    return { remId: params.remId, tags };
  }

  /**
   * Batch create multiple flashcards efficiently.
   */
  async batchCreateFlashcards(params: {
    parentId: string;
    cards: Array<{
      front: string;
      back: string;
      type?: 'forward' | 'backward' | 'bidirectional';
      tags?: string[];
    }>;
  }): Promise<{ created: number; cards: Array<{ remId: string; front: string }> }> {
    const results = [];
    for (const card of params.cards) {
      const result = await this.createFlashcard({
        parentId: params.parentId,
        front: card.front,
        back: card.back,
        type: card.type,
        tags: card.tags,
      });
      results.push({ remId: result.remId, front: result.front });
    }
    return { created: results.length, cards: results };
  }
}

