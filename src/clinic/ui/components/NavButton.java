package clinic.ui.components;

import clinic.ui.UITheme;

import javax.swing.BorderFactory;
import javax.swing.JButton;
import javax.swing.SwingConstants;
import java.awt.Color;
import java.awt.Cursor;
import java.awt.Dimension;
import java.awt.Font;
import java.awt.Graphics;
import java.awt.Graphics2D;
import java.awt.RenderingHints;

/** Sidebar navigation button that highlights when its page is open. */
public class NavButton extends JButton {
    private static final long serialVersionUID = 1L;

    private boolean active;

    public NavButton(String text) {
        super(text);
        setHorizontalAlignment(SwingConstants.LEFT);
        setForeground(new Color(0xCBD5E1));
        setFont(new Font("Segoe UI", Font.PLAIN, 14));
        setContentAreaFilled(false);
        setFocusPainted(false);
        setBorderPainted(false);
        setOpaque(false);
        setRolloverEnabled(true);
        setCursor(Cursor.getPredefinedCursor(Cursor.HAND_CURSOR));
        setBorder(BorderFactory.createEmptyBorder(10, 22, 10, 16));
        setMaximumSize(new Dimension(Integer.MAX_VALUE, 44));
    }

    public void setActive(boolean active) {
        this.active = active;
        setForeground(active ? Color.WHITE : new Color(0xCBD5E1));
        setFont(getFont().deriveFont(active ? Font.BOLD : Font.PLAIN));
        repaint();
    }

    @Override
    protected void paintComponent(Graphics g) {
        Graphics2D g2 = (Graphics2D) g.create();
        g2.setRenderingHint(RenderingHints.KEY_ANTIALIASING, RenderingHints.VALUE_ANTIALIAS_ON);
        if (active || getModel().isRollover()) {
            g2.setColor(UITheme.SIDEBAR_HOVER);
            g2.fillRoundRect(8, 2, getWidth() - 16, getHeight() - 4, 10, 10);
        }
        if (active) {
            g2.setColor(UITheme.ACCENT);
            g2.fillRoundRect(8, 10, 4, getHeight() - 20, 4, 4);
        }
        g2.dispose();
        super.paintComponent(g);
    }
}
