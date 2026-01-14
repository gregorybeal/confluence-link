import ADFBuilder from "lib/builder/adf";
import ParagraphDirector from "./paragraph";
import {
	BulletListItemElement,
	OrderedListElement,
	ParagraphElement,
	TaskListItemElement,
} from "lib/builder/types";

class ListDirector extends ParagraphDirector {
	async addList(node: HTMLOListElement | HTMLUListElement, filePath: string) {
		this.builder.addItem(await this.buildList(node, filePath));
	}

	async buildList(
		node: HTMLOListElement | HTMLUListElement,
		filePath: string
	): Promise<
		BulletListItemElement | OrderedListElement | TaskListItemElement
	> {
		const isTaskList = this.isTasklist(node);
		let list = this.builder.bulletListItem([]);

		if (node.nodeName == "OL") {
			list = this.builder.orderedListItem([]);
		}

		if (isTaskList) {
			// @ts-ignore
			list = this.builder.taskListItem([]);
		}

		await this.buildListItems(node, isTaskList, filePath, list);

		return list;
	}

	async buildListItems(
		node: HTMLOListElement | HTMLUListElement,
		isTaskList: boolean,
		filePath: string,
		list: BulletListItemElement | OrderedListElement | TaskListItemElement
	) {
		const items = await Promise.all(
			Array.from(node.children).map(async (li) => {
				const itemsAdfBuilder = new ADFBuilder();
				const paragraphDirector = new ParagraphDirector(
					itemsAdfBuilder,
					this.fileAdaptor,
					this.app,
					this.client,
					this.settings,
					this.labelDirector
				);

				if (isTaskList) {
					const taskContent = await this.buildTaskContent(
						li as HTMLLIElement,
						filePath,
						paragraphDirector,
						itemsAdfBuilder
					);
					const isChecked = this.isTaskChecked(li as HTMLElement);
					const localId = this.taskLocalId(li as HTMLElement, taskContent);

					return this.builder.taskItemFromContent(
						taskContent,
						isChecked,
						localId
					);
				}

				let p = createEl("p");
				let subList = null;

				for (const child of Array.from(li.childNodes)) {
					if (
						child.nodeType === Node.ELEMENT_NODE &&
						["OL", "UL"].includes(child.nodeName)
					) {
						subList = await this.buildList(
							child as HTMLOListElement | HTMLUListElement,
							filePath
						);
					} else {
						if (child.textContent == "\n") {
							continue;
						}

						if (
							child.nodeType == Node.ELEMENT_NODE &&
							child.nodeName == "P"
						) {
							p = child as HTMLParagraphElement;
							continue;
						}

						p.append(child);
					}
				}

				await paragraphDirector.addItems(p, filePath, true);
				const listItem = this.builder.listItem(itemsAdfBuilder.build());

				if (subList) {
					listItem.content.push(subList);
				}

				return listItem;
			})
		);

		if (items) {
			// @ts-ignore
			list.content.push(...items);
		}
	}

	private async buildTaskContent(
		li: HTMLLIElement,
		filePath: string,
		paragraphDirector: ParagraphDirector,
		itemsAdfBuilder: ADFBuilder
	): Promise<ParagraphElement["content"]> {
		const p = createEl("p");

		for (const child of Array.from(li.childNodes)) {
			if (
				child.nodeType === Node.ELEMENT_NODE &&
				["OL", "UL"].includes(child.nodeName)
			) {
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
		const paragraph = built.find(
			(item) => item.type === "paragraph"
		) as ParagraphElement | undefined;
		const content = paragraph?.content ?? [];

		if (content.length > 0) {
			return content;
		}

		const fallbackText =
			p.textContent?.trim() || li.textContent?.trim() || "task-item";

		return [this.builder.textItem(fallbackText)];
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

	private taskLocalId(
		li: HTMLElement,
		taskContent: ParagraphElement["content"]
	): string {
		const contentText = taskContent
			.map((item) => ("text" in item ? item.text : ""))
			.join("")
			.trim();

		return contentText || li.textContent?.trim() || "task-item";
	}

	isTasklist(node: HTMLOListElement | HTMLUListElement): boolean {
		return (
			node.querySelectorAll("li").length ===
			node.querySelectorAll('input[type="checkbox"]').length
		);
	}
}

export default ListDirector;
