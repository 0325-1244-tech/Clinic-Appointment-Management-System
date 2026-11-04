package clinic.ui.components;

import clinic.ui.UITheme;

import javax.swing.BorderFactory;
import javax.swing.JTextField;
import javax.swing.event.DocumentEvent;
import javax.swing.event.DocumentListener;
import java.awt.Dimension;
import java.awt.Graphics;
import java.awt.Graphics2D;
import java.awt.Insets;
import java.awt.RenderingHints;

/** A text field that shows grey hint text while it is empty. Used for search boxes. */
public class HintTextField extends JTextField {
    private static final long serialVersionUID = 1L;

    private final String hint;

    public HintTextField(String hint) {
        this.hint = hint;
        setFont(UITheme.BASE);
        setPreferredSize(new Dimension(300, 36));
        setBorder(BorderFactory.createCompoundBorder(
                BorderFactory.createLineBorder(UITheme.BORDER),
                BorderFactory.createEmptyBorder(4, 10, 4, 10)));
    }

    /** Runs the action every time the text changes. Used for live search. */
    public void onTextChanged(Runnable action) {
        getDocument().addDocumentListener(new DocumentListener() {
            @Override
            public void insertUpdate(DocumentEvent e) {
                action.run();
            }

            @Override
            public void removeUpdate(DocumentEvent e) {
                action.run();
            }

            @Override
            public void changedUpdate(DocumentEvent e) {
                action.run();
            }
        });
    }

    @Override
    protected void paintComponent(Graphics g) {
        super.paintComponent(g);
        if (getText().isEmpty()) {
            Graphics2D g2 = (Graphics2D) g.create();
            g2.setRenderingHint(RenderingHints.KEY_TEXT_ANTIALIASING, RenderingHints.VALUE_TEXT_ANTIALIAS_ON);
            g2.setColor(UITheme.MUTED);
            g2.setFont(getFont());
            Insets in = getInsets();
            int y = (getHeight() - g2.getFontMetrics().getHeight()) / 2 + g2.getFontMetrics().getAscent();
            g2.drawString(hint, in.left, y);
            g2.dispose();
        }
    }
}
