import { Stack, type StackProps } from 'aws-cdk-lib'
import { CfnBudget } from 'aws-cdk-lib/aws-budgets'
import type { Construct } from 'constructs'
import { PROJECT_TAGS } from './tags'

export const BUDGET_LIMIT_USD = 10

// Percentages of the monthly limit. Actual spend warns early and often;
// forecast warns once, when the month is on course to go over.
export const ACTUAL_THRESHOLDS = [50, 80, 100]
export const FORECAST_THRESHOLDS = [100]

export type BudgetStackProps = StackProps & {
  alertEmail: string
}

// The account-wide spending alarm. It alerts; it never stops anything.
// Lives in the management account, which pays every member account's bill,
// so it watches the whole Organization.
export class BudgetStack extends Stack {
  constructor(scope: Construct, id: string, props: BudgetStackProps) {
    super(scope, id, props)

    const subscribers = [
      { subscriptionType: 'EMAIL', address: props.alertEmail },
    ]
    const notify = (notificationType: string, threshold: number) => ({
      notification: {
        notificationType,
        comparisonOperator: 'GREATER_THAN',
        threshold,
        thresholdType: 'PERCENTAGE',
      },
      subscribers,
    })

    new CfnBudget(this, 'Monthly', {
      budget: {
        budgetName: 'harpguru-monthly',
        budgetType: 'COST',
        timeUnit: 'MONTHLY',
        budgetLimit: { amount: BUDGET_LIMIT_USD, unit: 'USD' },
        // Credits and refunds would otherwise net off against usage, and a
        // promotional credit could hold a runaway resource below every
        // threshold. The alarm is about what is being used.
        costTypes: { includeCredit: false, includeRefund: false },
      },
      notificationsWithSubscribers: [
        ...ACTUAL_THRESHOLDS.map((t) => notify('ACTUAL', t)),
        ...FORECAST_THRESHOLDS.map((t) => notify('FORECASTED', t)),
      ],
      // CfnBudget is not taggable as far as CDK's Tags.of is concerned, so the
      // app-root tags never reach it. They are set here by hand instead.
      resourceTags: Object.entries(PROJECT_TAGS).map(([key, value]) => ({
        key,
        value,
      })),
    })
  }
}
