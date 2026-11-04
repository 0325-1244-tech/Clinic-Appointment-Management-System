package clinic.ui.components;

import clinic.ui.UITheme;

import javax.swing.BorderFactory;
import javax.swing.JLabel;
import javax.swing.JPanel;
import java.awt.BorderLayout;
import java.awt.Color;
import java.awt.Graphics;
import java.awt.Graphics2D;
import java.awt.GridLayout;
import java.awt.RenderingHints;

/** Dashboard card that shows one number with a title and a coloured accent bar. */
public class StatCard extends RoundedPanel {
    private static final long serialVersionUID = 1L;

    private final Color accent;
    private final JLabel valueLabel = UITheme.label("0", UITheme.STAT, UITheme.TEXT);

    public StatCard(String title, String caption, Color accent) {
        super(new BorderLayout());
        this.accent = accent;
        setBorder(BorderFactory.createEmptyBorder(14, 22, 14, 18));

        JPanel text = new JPanel(new GridLayout(3, 1));
        text.setOpaque(false);
        text.add(UITheme.label(title, UITheme.BOLD, UITheme.MUTED));
        text.add(valueLabel);
        text.add(UITheme.label(caption, UITheme.SMALL, UITheme.MUTED));
        add(text, BorderLayout.CENTER);
    }

    public void setValue(String value) {
        valueLabel.setText(value);
    }

    @Override
    protected void paintComponent(Graphics g) {
        super.paintComponent(g);
        Graphics2D g2 = (Graphics2D) g.create();
        g2.setRenderingHint(RenderingHints.KEY_ANTIALIASING, RenderingHints.VALUE_ANTIALIAS_ON);
        g2.setColor(accent);
        g2.fillRoundRect(0, 12, 5, getHeight() - 24, 5, 5);
        g2.dispose();
    }
}
