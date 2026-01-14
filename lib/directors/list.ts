import ADFBuilder from "lib/builder/adf";
import ParagraphDirector from "./paragraph";
import {
	BulletListItemElement,
	OrderedListElement,
	ParagraphElement,
	TaskListItemElement,
	AdfElement,
} from "lib/builder/types";

class ListDirector extends ParagraphDirector {
	async addList(node: HTMLOListElement | HTMLUListElement, filePath: string) {
		const lists = await this.buildLists(node, filePath);
		lists.forEach((list) => this.builder.addItem(list));
	}

	async buildLists(
		node: HTMLOListElement | HTMLUListElement,
		filePath: string
	): Promise<
		Array<BulletListItemElement | OrderedListElement | TaskListItemElement>
	> {
		const lists: Array<
			BulletListItemElement | OrderedListElement | TaskListItemElement
		> = [];
		const listType = node.nodeName === "OL" ? "ordered" : "bullet";
		let currentList:
			| BulletListItemElement
			| OrderedListElement
			| TaskListItemElement
			| null = null;
		let currentKind: "task" | "standard" | null = null;

		for (const li of Array.from(node.children)) {
			const isTaskItem = this.isTaskItem(li as HTMLElement);
			const nextKind: "task" | "standard" = isTaskItem ? "task" : "standard";

			if (!currentList || currentKind !== nextKind) {
				if (currentList) {
					lists.push(currentList);
				}
				if (nextKind === "task") {
					currentList = this.builder.taskListItem([]);
				} else if (listType === "ordered") {
					currentList = this.builder.orderedListItem([]);
				} else {
					currentList = this.builder.bulletListItem([]);
				}
				currentKind = nextKind;
			}

			const itemsAdfBuilder = new ADFBuilder();
			const paragraphDirector = new ParagraphDirector(
				itemsAdfBuilder,
				this.fileAdaptor,
				this.app,
				this.client,
				this.settings,
				this.labelDirector
			);

			if (isTaskItem) {
				const taskContent = await this.buildTaskContent(
					li as HTMLLIElement,
					filePath,
					paragraphDirector,
					itemsAdfBuilder
				);
				const isChecked = this.isTaskChecked(li as HTMLElement);
				const localId = this.taskLocalId(li as HTMLElement, taskContent);

				(currentList as TaskListItemElement).content.push(
					this.builder.taskItemFromContent(taskContent, isChecked, localId)
				);
			} else {
				const listItem = await this.buildStandardListItem(
					li as HTMLLIElement,
					filePath,
					paragraphDirector,
					itemsAdfBuilder
				);
				(currentList as BulletListItemElement | OrderedListElement).content.push(
					listItem
				);
			}
		}

		if (currentList) {
			lists.push(currentList);
		}

		return lists;
	}

	private async buildStandardListItem(
		li: HTMLLIElement,
		filePath: string,
		paragraphDirector: ParagraphDirector,
		itemsAdfBuilder: ADFBuilder
	) {
		let p = createEl("p");
		const subLists: Array<
			BulletListItemElement | OrderedListElement | TaskListItemElement
		> = [];

		for (const child of Array.from(li.childNodes)) {
			if (
				child.nodeType === Node.ELEMENT_NODE &&
				["OL", "UL"].includes(child.nodeName)
			) {
				const nestedLists = await this.buildLists(
					child as HTMLOListElement | HTMLUListElement,
					filePath
				);
				subLists.push(...nestedLists);
			} else {
				if (child.textContent == "\n") {
					continue;
				}

				if (child.nodeType == Node.ELEMENT_NODE && child.nodeName == "P") {
					p = child as HTMLParagraphElement;
					continue;
				}

				p.append(child);
			}
		}

		await paragraphDirector.addItems(p, filePath, true);
		const listItem = this.builder.listItem(itemsAdfBuilder.build());

		if (subLists.length > 0) {
			listItem.content.push(...subLists);
		}

		return listItem;
	}

	private async buildTaskContent(
		li: HTMLLIElement,
		filePath: string,
		paragraphDirector: ParagraphDirector,
		itemsAdfBuilder: ADFBuilder
	): Promise<AdfElement[]> {
		const p = createEl("p");
		const subLists: Array<
			BulletListItemElement | OrderedListElement | TaskListItemElement
		> = [];

		for (const child of Array.from(li.childNodes)) {
			if (
				child.nodeType === Node.ELEMENT_NODE &&
				["OL", "UL"].includes(child.nodeName)
			) {
				const nestedLists = await this.buildLists(
					child as HTMLOListElement | HTMLUListElement,
					filePath
				);
				subLists.push(...nestedLists);
				continue;
			}

			if (
				child.nodeType === Node.ELEMENT_NODE &&
				child.nodeName === "INPUT" &&
				(child as HTMLInputElement).type === "checkbox"
			) {
				continue;
			}

			if (child.textContent === "\n") {
				continue;
			}

			if (child.nodeType === Node.ELEMENT_NODE) {
				const element = child as HTMLElement;
				const cloned = element.cloneNode(true) as HTMLElement;
				cloned
					.querySelectorAll('input[type="checkbox"]')
					.forEach((checkbox) => checkbox.remove());
				p.append(cloned);
			} else {
				p.append(child.cloneNode(true));
			}
		}

		await paragraphDirector.addItems(p as HTMLParagraphElement, filePath, true);
		const built = itemsAdfBuilder.build();
		let paragraph = built.find(
			(item) => item.type === "paragraph"
		) as ParagraphElement | undefined;

		if (!paragraph || paragraph.content.length === 0) {
			const fallbackText =
				p.textContent?.trim() || li.textContent?.trim() || "task-item";
			paragraph = this.builder.paragraphItem(fallbackText);
		}

		return [paragraph, ...subLists];
	}

	private isTaskChecked(li: HTMLElement): boolean {
		const dataTask = li.getAttr("data-task");
		if (dataTask) {
			return dataTask.trim().toLowerCase() === "x";
		}

		const checkbox = li.querySelector(
			'input[type="checkbox"]'
		) as HTMLInputElement | null;
		return checkbox?.checked ?? false;
	}

	private isTaskItem(li: HTMLElement): boolean {
		const dataTask = li.getAttr("data-task");
		if (dataTask) {
			return true;
		}
		return Boolean(li.querySelector('input[type="checkbox"]'));
	}

	private taskLocalId(
		li: HTMLElement,
		taskContent: AdfElement[]
	): string {
		const paragraph = taskContent.find(
			(item) => item.type === "paragraph"
		) as ParagraphElement | undefined;
		const contentText =
			paragraph?.content
				.map((item) => ("text" in item ? item.text : ""))
				.join("")
				.trim() ?? "";

		return contentText || li.textContent?.trim() || "task-item";
	}
}

export default ListDirector;
