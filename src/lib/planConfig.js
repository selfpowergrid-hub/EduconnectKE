/**
 * LogiQ-Taaluma Plan Configuration
 * Defines the three subscription tiers and their feature gates.
 */

export const PLANS = {
  starter: {
    id: 'starter',
    name: 'Enrol 300',
    label: 'KES 2,500/term',
    price: 2500,
    pricePeriod: 'per term',
    color: '#1B6B3A',
    bg: '#E8F5EE',
    icon: '🟢',
    maxStudents: 300,
    maxStaff: Infinity,
    maxStreams: Infinity,
    allowedNavIds: [
      'dashboard', 'getting-started', 'registration-form', 'school-info', 'streams-dorms',
      'students', 'teachers', 'teacher-allocations', 'exams', 'exam-entries', 'reports',
      'merit-list', 'analysis', 'school-reports', 'attendance', 'subjects', 'grading', 'report-comments', 'fees-structure', 'fees', 'fee-audit', 'fee-reports', 'fee-settings', 'pocket-money', 'banking', 'suppliers', 'payroll', 'final-accounts',
      'users', 'library',
    ],
    features: [
      'Up to 300 Students',
    ],
    excluded: [],
  },
  professional: {
    id: 'professional',
    name: 'Enrol 600',
    label: 'KES 3,500/term',
    price: 3500,
    pricePeriod: 'per term',
    color: '#1A5F9C',
    bg: '#EBF3FB',
    icon: '🔵',
    maxStudents: 600,
    maxStaff: Infinity,
    maxStreams: Infinity,
    allowedNavIds: [
      'dashboard', 'getting-started', 'registration-form', 'school-info', 'streams-dorms',
      'students', 'teachers', 'teacher-allocations', 'exams', 'exam-entries', 'reports',
      'merit-list', 'analysis', 'school-reports', 'attendance', 'subjects', 'grading', 'report-comments', 'fees-structure', 'fees', 'fee-audit', 'fee-reports', 'fee-settings', 'pocket-money', 'banking', 'suppliers', 'payroll', 'final-accounts',
      'users', 'library',
    ],
    features: [
      '301 to 600 Students',
    ],
    excluded: [],
  },
  enterprise: {
    id: 'enterprise',
    name: 'Enrol Max',
    label: 'KES 5,000/term',
    price: 5000,
    pricePeriod: 'per term',
    color: '#D4AF37',
    bg: '#F5EEF8',
    icon: '🟣',
    maxStudents: Infinity,
    maxStaff: Infinity,
    maxStreams: Infinity,
    allowedNavIds: [
      'dashboard', 'getting-started', 'registration-form', 'school-info', 'streams-dorms',
      'students', 'teachers', 'teacher-allocations', 'exams', 'exam-entries', 'reports',
      'merit-list', 'analysis', 'school-reports', 'attendance', 'subjects', 'grading', 'report-comments', 'fees-structure', 'fees', 'fee-audit', 'fee-reports', 'fee-settings', 'pocket-money', 'banking', 'suppliers', 'payroll', 'final-accounts',
      'users', 'library',
    ],
    features: [
      '601+ Students',
    ],
    excluded: [],
  },
};

/** Ordered list of plan tiers (lowest to highest) */
export const PLAN_ORDER = ['starter', 'professional', 'enterprise'];

/**
 * Check if a plan can access a specific navigation ID.
 * @param {string} planId - 'starter' | 'professional' | 'enterprise'
 * @param {string} navId  - Navigation item ID (e.g. 'exams', 'fees')
 * @returns {boolean}
 */
export function canAccessNav(planId, navId) {
  const plan = PLANS[planId] || PLANS.starter;
  return plan.allowedNavIds.includes(navId);
}

/**
 * Get the minimum plan required to access a navigation ID.
 * @param {string} navId
 * @returns {object} The plan object, or null if accessible by all
 */
export function getRequiredPlan(navId) {
  for (const planId of PLAN_ORDER) {
    if (PLANS[planId].allowedNavIds.includes(navId)) {
      return PLANS[planId];
    }
  }
  return PLANS.enterprise;
}

/**
 * Check if the current plan meets or exceeds the required plan.
 * @param {string} currentPlan
 * @param {string} requiredPlan
 * @returns {boolean}
 */
export function planMeetsRequirement(currentPlan, requiredPlan) {
  const currentIdx = PLAN_ORDER.indexOf(currentPlan);
  const requiredIdx = PLAN_ORDER.indexOf(requiredPlan);
  return currentIdx >= requiredIdx;
}

/**
 * Get limits for a plan.
 * @param {string} planId
 * @returns {object} { maxStudents, maxStaff, maxStreams }
 */
export function getPlanLimits(planId) {
  const plan = PLANS[planId] || PLANS.starter;
  return {
    maxStudents: plan.maxStudents,
    maxStaff: plan.maxStaff,
    maxStreams: plan.maxStreams,
  };
}

/**
 * Get a human-friendly upgrade message.
 * @param {string} navId
 * @returns {string}
 */
export function getUpgradeMessage(navId) {
  const required = getRequiredPlan(navId);
  return `Upgrade to ${required.name} to unlock this feature`;
}
