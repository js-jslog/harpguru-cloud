import { App } from 'aws-cdk-lib'
import { Match, Template } from 'aws-cdk-lib/assertions'
import { BudgetStack } from '../lib/budget-stack'
import { applyProjectTags, PROJECT_TAGS } from '../lib/tags'

const synth = () => {
  const app = new App()
  applyProjectTags(app)
  const stack = new BudgetStack(app, 'Budget', { alertEmail: 'a@b.c' })
  return Template.fromStack(stack)
}

const alert = (notificationType: string, threshold: number) => ({
  Notification: {
    NotificationType: notificationType,
    ComparisonOperator: 'GREATER_THAN',
    Threshold: threshold,
    ThresholdType: 'PERCENTAGE',
  },
  Subscribers: [{ SubscriptionType: 'EMAIL', Address: 'a@b.c' }],
})

test('the budget is $10 a month of cost, ignoring credits and refunds', () => {
  synth().hasResourceProperties('AWS::Budgets::Budget', {
    Budget: {
      BudgetType: 'COST',
      TimeUnit: 'MONTHLY',
      BudgetLimit: { Amount: 10, Unit: 'USD' },
      CostTypes: { IncludeCredit: false, IncludeRefund: false },
    },
  })
})

test('it alerts at 50, 80 and 100% actual and 100% forecast, and nothing else', () => {
  synth().hasResourceProperties('AWS::Budgets::Budget', {
    NotificationsWithSubscribers: [
      alert('ACTUAL', 50),
      alert('ACTUAL', 80),
      alert('ACTUAL', 100),
      alert('FORECASTED', 100),
    ],
  })
})

test('the budget carries the project tags, which Tags.of cannot give it', () => {
  synth().hasResourceProperties('AWS::Budgets::Budget', {
    ResourceTags: Match.arrayWith(
      Object.entries(PROJECT_TAGS).map(([Key, Value]) => ({ Key, Value }))
    ),
  })
})

test('the stack holds the budget and nothing else', () => {
  expect(Object.keys(synth().toJSON().Resources)).toHaveLength(1)
})
