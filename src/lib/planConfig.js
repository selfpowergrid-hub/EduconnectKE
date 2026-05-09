/**
 * EduConnect Plan Configuration
 * Defines the three subscription tiers and their feature gates.
 */

export const PLANS = {
  starter: {
    id: 'starter',
    name: 'Starter',
    label: 'Free',
    price: 0,
    pricePeriod: '',
    color: '#1B6B3A',
    bg: '#E8F5EE',
    icon: '🟢',
    maxStudents: 100,
    maxStaff: 10,
    maxStreams: 2,
    // Navigation IDs this plan can access
    allowedNavIds: [
      'dashboard',
      'registration-form',
      'school-info',
      'streams-dorms',
      'students',
      'teachers',
    ],
    features: [
      'Basic Dashboard',
      'School Registration & Info',
      'Up to 100 Students',
      'Up to 10 Staff Members',
      '2 Streams',
    ],
    excluded: [
      'Examinations & Grading',
      'Report Cards & Merit Lists',
      'Fee Management',
      'Users & Roles',
      'Library Module',
      'SMS Alerts',
    ],
  },
  professional: {
    id: 'professional',
    name: 'Professional',
    label: 'KES 2,500/term',
    price: 2500,
    pricePeriod: 'per term',
    color: '#1A5F9C',
    bg: '#EBF3FB',
    icon: '🔵',
    maxStudents: 500,
    maxStaff: 50,
    maxStreams: Infinity,
    allowedNavIds: [
      'dashboard',
      'registration-form',
      'school-info',
      'streams-dorms',
      'students',
      'teachers',
      'exams',
      'exam-entries',
      'reports',
      'merit-list',
      'subjects',
      'grading',
      'fees-structure',
      'fees',
    ],
    features: [
      'Everything in Starter',
      'Up to 500 Students',
      'Up to 50 Staff Members',
      'Unlimited Streams',
      'Examinations & Grading',
      'Report Cards & Merit Lists',
      'Fee Structure & Management',
      'Subjects Configuration',
    ],
    excluded: [
      'Users & Roles Management',
      'Library Module',
      'SMS Alerts',
      'Priority Support',
    ],
  },
  enterprise: {
    id: 'enterprise',
    name: 'Enterprise',
    label: 'KES 5,000/term',
    price: 5000,
    pricePeriod: 'per term',
    color: '#6C3483',
    bg: '#F5EEF8',
    icon: '🟣',
    maxStudents: Infinity,
    maxStaff: Infinity,
    maxStreams: Infinity,
    allowedNavIds: [
      'dashboard',
      'registration-form',
      'school-info',
      'streams-dorms',
      'students',
      'teachers',
      'exams',
      'exam-entries',
      'reports',
      'merit-list',
      'subjects',
      'grading',
      'fees-structure',
      'fees',
      'users',
      'library',
    ],
    features: [
      'Everything in Professional',
      'Unlimited Students & Staff',
      'Users & Roles Management',
      'Library Module',
      'SMS Alerts',
      'Priority Support',
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
