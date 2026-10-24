package javafx.scene;

import javafx.collections.ListChangeListener;

/** Repair effective disabled inheritance in the pinned WebFX Node implementation. */
public final class ZeroDisabledState {
    private static final Object STATE = new Object();
    private static final Object INSTALLED = new Object();
    private final Node node;

    private ZeroDisabledState(Node node) {
        this.node = node;
        node.getProperties().put(STATE, this);
        node.disableProperty().addListener((observable, before, after) -> refresh());
        node.parentProperty().addListener((observable, before, after) -> refresh());
        node.disabledProperty().addListener((observable, before, after) -> refreshChildren());
        if (node instanceof Parent parent) {
            parent.getChildrenUnmodifiable().addListener((ListChangeListener<Node>) change -> {
                while (change.next()) {
                    for (Node removed : change.getRemoved()) watch(removed);
                    for (Node added : change.getAddedSubList()) watch(added);
                }
            });
        }
        refresh();
    }

    public static void install(Scene scene) {
        if (scene.getProperties().containsKey(INSTALLED)) return;
        scene.getProperties().put(INSTALLED, true);
        scene.rootProperty().addListener((observable, before, after) -> watch(after));
        watch(scene.getRoot());
    }

    private static void watch(Node node) {
        if (node == null) return;
        Object state = node.getProperties().get(STATE);
        if (state instanceof ZeroDisabledState observer) observer.refresh();
        else new ZeroDisabledState(node);
    }

    private void refresh() {
        boolean effective = node.isDisable() || (node.getParent() != null && node.getParent().isDisabled());
        if (node.isDisabled() != effective) node.setDisabled(effective);
        else refreshChildren();
    }

    private void refreshChildren() {
        if (node instanceof Parent parent) {
            for (Node child : parent.getChildrenUnmodifiable()) watch(child);
        }
    }
}
