import { Immutable, IServiceLocator } from '@aurelia/kernel';
import { BindingMode, HydrateTemplateController, IAttributeDefinition, IBindableDescription, IExpressionParser, IResourceDescriptions, ITemplateDefinition, TargetedInstruction } from '@aurelia/runtime';
import { AttrSyntax, IAttributeParser } from './attribute-parser';
import { IBindingCommand } from './binding-command';
import { ElementSyntax, IElementParser } from './element-parser';
export declare class SemanticModel {
    readonly isSemanticModel: true;
    readonly root: ElementSymbol;
    resources: IResourceDescriptions;
    attrParser: IAttributeParser;
    elParser: IElementParser;
    exprParser: IExpressionParser;
    private readonly attrDefCache;
    private readonly elDefCache;
    private readonly commandCache;
    private constructor();
    static create(definition: ITemplateDefinition, resources: IResourceDescriptions, attrParser: IAttributeParser, elParser: IElementParser, exprParser: IExpressionParser): SemanticModel;
    static create(definition: ITemplateDefinition, resources: IResourceDescriptions, locator: IServiceLocator): SemanticModel;
    getAttributeDefinition(name: string): IAttributeDefinition;
    getElementDefinition(name: string): ITemplateDefinition;
    getBindingCommand(name: string): IBindingCommand;
    getAttributeSymbol(syntax: AttrSyntax, element: ElementSymbol): AttributeSymbol;
    getMultiAttrBindingSymbol(syntax: AttrSyntax, parent: AttributeSymbol): MultiAttributeBindingSymbol;
    getElementSymbol(syntax: ElementSyntax, parent: ElementSymbol): ElementSymbol;
    getTemplateElementSymbol(syntax: ElementSyntax, parent: ElementSymbol, definition: ITemplateDefinition, definitionRoot: ElementSymbol): ElementSymbol;
}
export interface IAttributeSymbol {
    readonly $element: ElementSymbol;
    readonly syntax: AttrSyntax;
    readonly command: IBindingCommand | null;
    readonly target: string;
    readonly res: string | null;
    readonly to: string;
    readonly mode: BindingMode;
    readonly bindable: IBindableDescription;
    readonly rawName: string;
    readonly rawValue: string;
    readonly rawCommand: string;
    readonly hasBindingCommand: boolean;
    readonly isMultiAttrBinding: boolean;
    readonly isHandledByBindingCommand: boolean;
    readonly isTemplateController: boolean;
    readonly isCustomAttribute: boolean;
    readonly isAttributeBindable: boolean;
    readonly isDefaultAttributeBindable: boolean;
    readonly onCustomElement: boolean;
    readonly isElementBindable: boolean;
}
export declare class MultiAttributeBindingSymbol implements IAttributeSymbol {
    readonly semanticModel: SemanticModel;
    readonly $parent: AttributeSymbol;
    readonly $element: ElementSymbol;
    readonly syntax: AttrSyntax;
    readonly command: IBindingCommand | null;
    readonly target: string;
    readonly res: string;
    readonly to: string;
    readonly mode: BindingMode;
    readonly bindable: Immutable<Required<IBindableDescription>> | null;
    readonly rawName: string;
    readonly rawValue: string;
    readonly rawCommand: string | null;
    readonly hasBindingCommand: boolean;
    readonly isMultiAttrBinding: boolean;
    readonly isHandledByBindingCommand: boolean;
    readonly isTemplateController: boolean;
    readonly isCustomAttribute: boolean;
    readonly isAttributeBindable: boolean;
    readonly isDefaultAttributeBindable: boolean;
    readonly onCustomElement: boolean;
    readonly isElementBindable: boolean;
    constructor(semanticModel: SemanticModel, $parent: AttributeSymbol, syntax: AttrSyntax, command: IBindingCommand | null);
}
export declare class AttributeSymbol implements IAttributeSymbol {
    readonly semanticModel: SemanticModel;
    readonly definition: IAttributeDefinition | null;
    readonly $element: ElementSymbol;
    readonly syntax: AttrSyntax;
    readonly command: IBindingCommand | null;
    readonly target: string;
    readonly res: string | null;
    readonly to: string;
    readonly mode: BindingMode;
    readonly bindable: Immutable<Required<IBindableDescription>> | null;
    readonly rawName: string;
    readonly rawValue: string;
    readonly rawCommand: string | null;
    readonly hasBindingCommand: boolean;
    readonly isMultiAttrBinding: boolean;
    readonly isHandledByBindingCommand: boolean;
    readonly isTemplateController: boolean;
    readonly isCustomAttribute: boolean;
    readonly isAttributeBindable: boolean;
    readonly isDefaultAttributeBindable: boolean;
    readonly onCustomElement: boolean;
    readonly isElementBindable: boolean;
    readonly $multiAttrBindings: ReadonlyArray<MultiAttributeBindingSymbol>;
    readonly isBindable: boolean;
    private _isProcessed;
    readonly isProcessed: boolean;
    constructor(semanticModel: SemanticModel, $element: ElementSymbol, syntax: AttrSyntax, definition: IAttributeDefinition | null, command: IBindingCommand | null);
    markAsProcessed(): void;
}
export declare class ElementSymbol {
    readonly semanticModel: SemanticModel;
    readonly isRoot: boolean;
    readonly $root: ElementSymbol;
    readonly $parent: ElementSymbol;
    readonly definition: ITemplateDefinition | null;
    readonly $attributes: ReadonlyArray<AttributeSymbol>;
    readonly $children: ReadonlyArray<ElementSymbol>;
    readonly $liftedChildren: ReadonlyArray<ElementSymbol>;
    readonly $content: ElementSymbol;
    readonly isMarker: boolean;
    readonly isTemplate: boolean;
    readonly isSlot: boolean;
    readonly isLet: boolean;
    readonly node: Node;
    readonly syntax: ElementSyntax;
    readonly name: string;
    readonly isCustomElement: boolean;
    readonly nextSibling: ElementSymbol;
    readonly firstChild: ElementSymbol;
    readonly componentRoot: ElementSymbol;
    readonly isLifted: boolean;
    private _$content;
    private _isMarker;
    private _isTemplate;
    private _isSlot;
    private _isLet;
    private _node;
    private _syntax;
    private _name;
    private _isCustomElement;
    private _isLifted;
    constructor(semanticModel: SemanticModel, isRoot: boolean, $root: ElementSymbol, $parent: ElementSymbol, syntax: ElementSyntax, definition: ITemplateDefinition | null);
    makeTarget(): void;
    replaceTextNodeWithMarker(): void;
    replaceNodeWithMarker(): void;
    lift(instruction: HydrateTemplateController): ElementSymbol;
    addInstructions(instructions: TargetedInstruction[]): void;
    private setToMarker;
}
//# sourceMappingURL=semantic-model.d.ts.map