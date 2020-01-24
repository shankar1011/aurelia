/* eslint-disable no-template-curly-in-string */
import { Class, DI, Protocol, Metadata, ILogger } from '@aurelia/kernel';
import {
  BindingType,
  IExpressionParser,
  IInterpolationExpression,
  IsBindingBehavior,
  LifecycleFlags,
  PrimitiveLiteralExpression,
  Interpolation,
  AccessScopeExpression,
  AccessThisExpression,
  Scope,
} from '@aurelia/runtime';
import {
  BaseValidationRule,
  ValidationRuleAlias,
  RequiredRule,
  RegexRule,
  LengthRule,
  SizeRule,
  RangeRule,
  EqualsRule,
  IValidateable,
  IValidationMessageProvider,
  ValidationRuleAliasMessage,
  ValidationRuleExecutionPredicate
} from './rules';

/**
 * Contract to register the custom messages for rules, during plugin registration.
 */
export interface ICustomMessage<TRule extends BaseValidationRule = BaseValidationRule> {
  rule: Class<TRule>;
  aliases: ValidationRuleAlias[];
}

/* @internal */
export const ICustomMessages = DI.createInterface<ICustomMessage[]>("ICustomMessages").noDefault();

export type ValidationDisplayNameAccessor = () => string;

/**
 * Describes a property to be validated.
 */
export class RuleProperty {
  /**
   * @param {IsBindingBehavior} [expression] - parsed property expression.
   * @param {(string | number | undefined)} [name=void 0] - name of the property; absent for a object validation.
   * @param {(string | ValidationDisplayNameAccessor | undefined)} [displayName=void 0] - display name of the property to be used in validation error messages.
   */
  public constructor(
    public expression?: IsBindingBehavior,
    public name: string | number | undefined = void 0,
    public displayName: string | ValidationDisplayNameAccessor | undefined = void 0,
  ) { }
}
export type RuleCondition<TObject extends IValidateable = IValidateable, TValue = any> = (value: TValue, object?: TObject) => boolean | Promise<boolean>;

export const validationRulesRegistrar = Object.freeze({
  name: 'validation-rules',
  defaultRuleSetName: '__default',
  set(target: IValidateable, rules: PropertyRule[], tag?: string): void {
    const key = `${validationRulesRegistrar.name}:${tag ?? validationRulesRegistrar.defaultRuleSetName}`;
    Metadata.define(Protocol.annotation.keyFor(key), rules, target);
    const keys = Metadata.getOwn(Protocol.annotation.name, target) as string[];
    if (keys === void 0) {
      Metadata.define(Protocol.annotation.name, [key], target);
    } else {
      keys.push(key);
    }
  },
  get(target: IValidateable, tag?: string): PropertyRule[] {
    return Metadata.getOwn(Protocol.annotation.keyFor(validationRulesRegistrar.name, tag ?? validationRulesRegistrar.defaultRuleSetName), target);
  },
  unset(target: IValidateable, tag?: string): void {
    const keys = Metadata.getOwn(Protocol.annotation.name, target) as string[];
    for (const key of keys.slice(0)) {
      if (key.startsWith(validationRulesRegistrar.name) && (tag === void 0 || key.endsWith(tag))) {
        Metadata.delete(Protocol.annotation.keyFor(key), target);
        const index = keys.indexOf(key);
        if (index > -1) {
          keys.splice(index, 1);
        }
      }
    }
  },
  isValidationRulesSet(target: IValidateable) {
    return (Metadata.getOwn(Protocol.annotation.name, target) as string[] ?? [])
      .some((key) => key.startsWith(validationRulesRegistrar.name));
  }
});

/**
 * Describes a collection of rules, defined on a property.
 */
export class PropertyRule<TObject extends IValidateable = IValidateable, TValue = unknown> {

  private latestRule?: BaseValidationRule;

  public constructor(
    public readonly validationRules: IValidationRules,
    public readonly messageProvider: IValidationMessageProvider,
    public property: RuleProperty,
    public $rules: BaseValidationRule[][] = [[]],
  ) { }

  /** @internal */
  public addRule(rule: BaseValidationRule) {
    const rules: BaseValidationRule[] = this.getLeafRules();
    rules.push(this.latestRule = rule);
    return this;
  }

  private getLeafRules(): BaseValidationRule[] {
    const depth = this.$rules.length - 1;
    return this.$rules[depth];
  }

  public async validate(value: TValue, object?: IValidateable, tag?: string, flags: LifecycleFlags = LifecycleFlags.none): Promise<ValidationResult[]> {

    let isValid = true;
    const validateRuleset = async (rules: BaseValidationRule[]) => {
      const validateRule = async (rule: BaseValidationRule) => {
        let isValidOrPromise = rule.execute(value, object);
        if (isValidOrPromise instanceof Promise) {
          isValidOrPromise = await isValidOrPromise;
        }
        isValid = isValid && isValidOrPromise;
        const { displayName, name } = this.property;
        let message: string | undefined;
        if (!isValidOrPromise) {
          const scope = Scope.create(flags, {
            $object: object,
            $displayName: (displayName instanceof Function ? displayName() : displayName) ?? name,
            $propertyName: name,
            $value: value,
            $rule: rule,
            $getDisplayName: this.messageProvider.getDisplayName
          });
          message = rule.message.evaluate(flags, scope, null!) as string;
        }
        return new ValidationResult(isValidOrPromise, message, name, object, rule, this);
      };

      const promises: Promise<ValidationResult>[] = [];
      for (const rule of rules) {
        if (rule.canExecute(object) && (tag === void 0 || rule.tag === tag)) {
          promises.push(validateRule(rule));
        }
      }
      return Promise.all(promises);
    };
    const accumulateResult = async (results: ValidationResult[], rules: BaseValidationRule[]) => {
      const result = await validateRuleset(rules);
      results.push(...result);
      return results;
    };
    return this.$rules.reduce(async (acc, ruleset) => {
      if (isValid) {
        acc = acc.then(async (accValidateResult) => accumulateResult(accValidateResult, ruleset));
      }
      return acc;
    }, Promise.resolve([] as ValidationResult[]));
  }

  // #region customization API
  /**
   * Validate subsequent rules after previously declared rules have been validated successfully.
   * Use to postpone validation of costly rules until less expensive rules pass validation.
   */
  public then() {
    this.$rules.push([]);
    return this;
  }

  /**
   * Specifies the key to use when looking up the rule's validation message.
   * Note that custom keys needs to be registered during plugin registration.
   */
  public withMessageKey(key: string) {
    this.assertLatesRule(this.latestRule);
    this.latestRule.messageKey = key;
    return this;
  }

  /**
   * Specifies rule's validation message; this overrides the rules default validation message.
   */
  public withMessage(message: string) {
    this.assertLatesRule(this.latestRule);
    this.latestRule.setMessage(message);
    return this;
  }

  /**
   * Specifies a condition that must be met before attempting to validate the rule.
   *
   * @param {ValidationRuleExecutionPredicate<TObject>} condition - A function that accepts the object as a parameter and returns true or false whether the rule should be evaluated.
   */
  public when(this: PropertyRule<TObject>, condition: ValidationRuleExecutionPredicate<TObject>) {
    this.assertLatesRule(this.latestRule);
    this.latestRule.canExecute = condition;
    return this;
  }

  /**
   * Tags the rule instance.
   * The tag can later be used to perform selective validation.
   */
  public tag(tag: string) {
    this.assertLatesRule(this.latestRule);
    this.latestRule.tag = tag;
    return this;
  }

  private assertLatesRule(latestRule: BaseValidationRule | undefined): asserts latestRule is BaseValidationRule {
    if (latestRule === void 0) {
      throw new Error('No rule has been added'); // TODO use reporter
    }
  }
  // #endregion

  // #region rule helper API
  /**
   * Sets the display name of the ensured property.
   */
  public displayName(name: string | ValidationDisplayNameAccessor) {
    this.property.displayName = name;
    return this;
  }

  /**
   * Applies an ad-hoc rule function to the ensured property or object.
   *
   * @param {RuleCondition} condition - The function to validate the rule. Will be called with two arguments, the property value and the object.
   */
  public satisfies(condition: RuleCondition) {
    const rule = new (class extends BaseValidationRule { public execute: RuleCondition = condition; })(this.messageProvider);
    return this.addRule(rule);
  }

  /**
   * Applies a custom rule instance.
   *
   * @param {TRule} validationRule - rule instance.
   */
  public satisfiesRule<TRule extends BaseValidationRule>(validationRule: TRule) {
    return this.addRule(validationRule);
  }

  /**
   * Applies an instance of `RequiredRule`.
   */
  public required() {
    return this.addRule(new RequiredRule(this.messageProvider));
  }

  /**
   * Applies an instance of `RegexRule`.
   */
  public matches(this: PropertyRule<TObject, string>, regex: RegExp) {
    return this.addRule(new RegexRule(this.messageProvider, regex));
  }

  /**
   * Applies an instance of `RegexRule` with email pattern.
   */
  public email(this: PropertyRule<TObject, string>) {
    // eslint-disable-next-line no-useless-escape
    const emailPattern = /^[a-zA-Z0-9.!#$%&'*+\/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/;
    return this.addRule(new RegexRule(this.messageProvider, emailPattern, 'email'));
  }

  /**
   * Applies an instance of `LengthRule` with min `length` constraint.
   * Applicable for string value.
   */
  public minLength(this: PropertyRule<TObject, string>, length: number) {
    return this.addRule(new LengthRule(this.messageProvider, length, false));
  }

  /**
   * Applies an instance of `LengthRule` with max `length` constraint.
   * Applicable for string value.
   */
  public maxLength(this: PropertyRule<TObject, string>, length: number) {
    return this.addRule(new LengthRule(this.messageProvider, length, true));
  }

  /**
   * Applies an instance of `SizeRule` with min `count` constraint.
   * Applicable for array value.
   */
  public minItems(this: PropertyRule<TObject, unknown[]>, count: number) {
    return this.addRule(new SizeRule(this.messageProvider, count, false));
  }

  /**
   * Applies an instance of `SizeRule` with max `count` constraint.
   * Applicable for array value.
   */
  public maxItems(this: PropertyRule<TObject, unknown[]>, count: number) {
    return this.addRule(new SizeRule(this.messageProvider, count, true));
  }

  /**
   * Applies an instance of `RangeRule` with [`constraint`,] interval.
   * Applicable for number value.
   */
  public min(this: PropertyRule<TObject, number>, constraint: number) {
    return this.addRule(new RangeRule(this.messageProvider, true, { min: constraint }));
  }

  /**
   * Applies an instance of `RangeRule` with [,`constraint`] interval.
   * Applicable for number value.
   */
  public max(this: PropertyRule<TObject, number>, constraint: number) {
    return this.addRule(new RangeRule(this.messageProvider, true, { max: constraint }));
  }

  /**
   * Applies an instance of `RangeRule` with [`min`,`max`] interval.
   * Applicable for number value.
   */
  public range(this: PropertyRule<TObject, number>, min: number, max: number) {
    return this.addRule(new RangeRule(this.messageProvider, true, { min, max }));
  }

  /**
   * Applies an instance of `RangeRule` with (`min`,`max`) interval.
   * Applicable for number value.
   */
  public between(this: PropertyRule<TObject, number>, min: number, max: number) {
    return this.addRule(new RangeRule(this.messageProvider, false, { min, max }));
  }

  /**
   * Applies an instance of `EqualsRule` with the `expectedValue`.
   */
  public equals(expectedValue: unknown) {
    return this.addRule(new EqualsRule(this.messageProvider, expectedValue));
  }
  // #endregion

  // #region ValidationRules proxy
  /**
   * Targets a object property for validation
   *
   * @param {(keyof TObject | string | PropertyAccessor<TObject, TValue>)} property - can be string or a property accessor function.
   */
  public ensure<TProp extends keyof TObject>(property: TProp): PropertyRule<TObject, TObject[TProp]>;
  public ensure<TValue>(property: PropertyAccessor<TObject, TValue>): PropertyRule<TObject, TValue>;
  public ensure(property: string): PropertyRule;
  public ensure<TValue>(property: string | PropertyAccessor<TObject, TValue>) {
    this.latestRule = void 0;
    return this.validationRules.ensure<TValue>(property);
  }

  /**
   * Targets an object with validation rules.
   */
  public ensureObject() {
    this.latestRule = void 0;
    return this.validationRules.ensureObject();
  }

  /**
   * Rules that have been defined using the fluent API.
   */
  public get rules() {
    return this.validationRules.rules;
  }

  /**
   * Applies the rules to a class or object, making them discoverable by the StandardValidator.
   *
   * @param {IValidateable} target - A class or object.
   * @param {string} [tag] - Tag to use to mark the ruleset for the `target`
   */
  public on<TAnotherObject extends IValidateable = IValidateable>(target: Class<TAnotherObject> | TAnotherObject, tag?: string): IValidationRules<TAnotherObject>;
  public on(target: IValidateable, tag?: string) {
    return this.validationRules.on(target, tag);
  }
  // #endregion
}

export interface IValidationRules<TObject extends IValidateable = IValidateable> {
  rules: PropertyRule[];
  /**
   * Targets a object property for validation
   *
   * @param {(keyof TObject | string | PropertyAccessor<TObject, TValue>)} property - can be string or a property accessor function.
   */
  ensure<TProp extends keyof TObject>(property: TProp): PropertyRule<TObject, TObject[TProp]>;
  ensure<TValue>(property: string | PropertyAccessor<TObject, TValue>): PropertyRule<TObject, TValue>;

  /**
   * Targets an object with validation rules.
   */
  ensureObject(): PropertyRule;

  /**
   * Applies the rules to a class or object, making them discoverable by the StandardValidator.
   *
   * @param {IValidateable} target - A class or object.
   * @param {string} [tag] - Tag to use to mark the ruleset for the `target`
   */
  on<TAnotherObject extends IValidateable = IValidateable>(target: Class<TAnotherObject> | TAnotherObject, tag?: string): IValidationRules<TAnotherObject>;

  /**
   * Removes the rules from a class or object.
   *
   * @param {IValidateable} [target] - When omitted, it removes rules for all the objects, for which rules are registered via this instance of IValidationRules
   * @param {string} [tag] - Use this tag to remove a specific ruleset. If omitted all rulesets of the object are removed.
   */
  off<TAnotherObject extends IValidateable = IValidateable>(target?: Class<TAnotherObject> | TAnotherObject, tag?: string): void;
}
export const IValidationRules = DI.createInterface<IValidationRules>('IValidationRules').noDefault();

export class ValidationRules<TObject extends IValidateable = IValidateable> implements IValidationRules<TObject> {
  public rules: PropertyRule[] = [];
  private readonly targets: Set<IValidateable> = new Set<IValidateable>();

  public constructor(
    @IExpressionParser private readonly parser: IExpressionParser,
    @IValidationMessageProvider private readonly messageProvider: IValidationMessageProvider,
  ) { }

  public ensure<TValue>(property: keyof TObject | string | PropertyAccessor): PropertyRule {
    const [name, expression] = parsePropertyName(property as any, this.parser);
    // eslint-disable-next-line eqeqeq
    let rule = this.rules.find((r) => r.property.name == name);
    if (rule === void 0) {
      rule = new PropertyRule(this, this.messageProvider, new RuleProperty(expression, name));
      this.rules.push(rule);
    }
    return rule;
  }

  public ensureObject(): PropertyRule {
    const rule = new PropertyRule(this, this.messageProvider, new RuleProperty());
    this.rules.push(rule);
    return rule;
  }

  public on(target: IValidateable, tag?: string) {
    const rules = validationRulesRegistrar.get(target, tag);
    if (Object.is(rules, this.rules)) {
      return this;
    }
    this.rules = rules ?? [];
    validationRulesRegistrar.set(target, this.rules, tag);
    this.targets.add(target);
    return this;
  }

  public off(target?: IValidateable, tag?: string): void {
    const $targets = target !== void 0 ? [target] : Array.from(this.targets);
    for (const $target of $targets) {
      validationRulesRegistrar.unset($target, tag);
      if (!validationRulesRegistrar.isValidationRulesSet($target)) {
        this.targets.delete($target);
      }
    }
  }
}

export type PropertyAccessor<TObject extends IValidateable = IValidateable, TValue = unknown> = (object: TObject) => TValue;
export function parsePropertyName(property: string | PropertyAccessor, parser: IExpressionParser): [string, IsBindingBehavior] {

  switch (typeof property) {
    case "string":
      break;
    case "function": {
      const classic = /^function\s*\([$_\w\d]+\)\s*\{(?:\s*["']{1}use strict["']{1};)?\s*(?:[$_\w\d.['"\]+;]+)?\s*return\s+[$_\w\d]+((\.[$_\w\d]+|\[['"$_\w\d]+\])+)\s*;?\s*\}$/;
      const arrow = /^\(?[$_\w\d]+\)?\s*=>\s*[$_\w\d]+((\.[$_\w\d]+|\[['"$_\w\d]+\])+)$/;
      const fn = property.toString();
      const match = classic.exec(fn) ?? arrow.exec(fn);
      if (match === null) {
        throw new Error(`Unable to parse accessor function:\n${fn}`); // TODO use reporter
      }
      property = match[1].substring(1);
      break;
    }
    default:
      throw new Error(`Unable to parse accessor function:\n${property}`); // TODO use reporter
  }

  return [property, parser.parse(property, BindingType.None)];
}

/**
 * The result of validating an individual validation rule.
 */
export class ValidationResult<TRule extends BaseValidationRule = BaseValidationRule> {
  private static nextId = 0;

  /**
   * A number that uniquely identifies the result instance.
   */
  public id: number;
  /**
   * @param {boolean} valid - `true` is the validation was successful, else `false`.
   * @param {(string | undefined)} message - Evaluated validation message, if the result is not valid, else `undefined`.
   * @param {(string | number | undefined)} propertyName - Associated property name.
   * @param {(IValidateable | undefined)} object - Associated target object.
   * @param {(TRule | undefined)} rule - Associated instance of rule.
   * @param {(PropertyRule | undefined)} propertyRule - Associated parent property rule.
   * @param {boolean} [isManual=false] - `true` if the validation result is added manually.
   */
  public constructor(
    public valid: boolean,
    public message: string | undefined,
    public propertyName: string | number | undefined,
    public object: IValidateable | undefined,
    public rule: TRule | undefined,
    public propertyRule: PropertyRule | undefined,
    public isManual: boolean = false
  ) {
    this.id = ValidationResult.nextId++;
  }

  public toString() {
    return this.valid ? 'Valid.' : this.message;
  }
}

const contextualProperties: Readonly<Set<string>> = new Set([
  "displayName",
  "propertyName",
  "value",
  "object",
  "config",
  "getDisplayName"
]);

export class ValidationMessageProvider implements IValidationMessageProvider {

  private readonly logger: ILogger;

  public constructor(
    @IExpressionParser public parser: IExpressionParser,
    @ILogger logger: ILogger,
    @ICustomMessages customMessages: ICustomMessage[],
  ) {
    this.logger = logger.scopeTo(ValidationMessageProvider.name);
    for (const { rule, aliases } of customMessages) {
      ValidationRuleAliasMessage.setDefaultMessage(rule, { aliases });
    }
  }

  public getMessage(rule: BaseValidationRule): IInterpolationExpression | PrimitiveLiteralExpression {
    const validationMessages = ValidationRuleAliasMessage.getDefaultMessages(rule);
    const messageKey = rule.messageKey;
    let message: string | undefined;
    const messageCount = validationMessages.length;
    if (messageCount === 1 && messageKey === void 0) {
      message = validationMessages[0].defaultMessage;
    } else {
      message = validationMessages.find(m => m.name === messageKey)?.defaultMessage;
    }
    if (!message) {
      message = ValidationRuleAliasMessage.getDefaultMessages(BaseValidationRule)[0].defaultMessage!;
    }
    return this.parseMessage(message);
  }

  public parseMessage(message: string): IInterpolationExpression | PrimitiveLiteralExpression {
    const parsed = this.parser.parse(message, BindingType.Interpolation);
    if (parsed instanceof Interpolation) {
      for (const expr of parsed.expressions) {
        const name = (expr as AccessScopeExpression).name;
        if (contextualProperties.has(name)) {
          this.logger.warn(`Did you mean to use "$${name}" instead of "${name}" in this validation message template: "${message}"?`);
        }
        if (expr instanceof AccessThisExpression || (expr as AccessScopeExpression).ancestor > 0) {
          throw new Error('$parent is not permitted in validation message expressions.'); // TODO use reporter
        }
      }
      return parsed;
    }
    return new PrimitiveLiteralExpression(message);
  }

  public getDisplayName(propertyName: string | number, displayName?: string | null | (() => string)): string {
    if (displayName !== null && displayName !== undefined) {
      return (displayName instanceof Function) ? displayName() : displayName as string;
    }

    // split on upper-case letters.
    const words = propertyName.toString().split(/(?=[A-Z])/).join(' ');
    // capitalize first letter.
    return words.charAt(0).toUpperCase() + words.slice(1);
  }
}

export class LocalizedValidationMessageProvider extends ValidationMessageProvider {
  // TODO no more monkey patching prototype in user code, rather a standard i18n validation message provider impl
}